import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_PROVIDER_MODELS,
  PlannerProviderConfigInput,
  PlannerProviderConfigPublic,
  PlannerProviderConfigStored,
  type PlannerProvider,
} from '@browser-automation/shared'
import { config, plannerEnvDefaults } from '../config.js'

type ResolvedPlannerConfig = {
  provider: PlannerProvider
  model?: string
  baseUrl?: string
  apiKey?: string
  source: 'default' | 'env' | 'local'
  ready: boolean
  warning?: string
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const defaultConfigPath = path.join(packageRoot, '.local', 'planner-config.json')

export async function loadStoredPlannerConfig() {
  try {
    const raw = await readFile(getPlannerConfigPath(), 'utf8')
    const parsed = JSON.parse(raw)
    const result = PlannerProviderConfigStored.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export async function savePlannerConfig(input: unknown) {
  const parsed = PlannerProviderConfigInput.parse(input)
  const normalized = PlannerProviderConfigStored.parse({
    provider: parsed.provider,
    model: parsed.model?.trim() || undefined,
    baseUrl: parsed.baseUrl?.trim() || undefined,
    apiKey: parsed.apiKey?.trim() || undefined,
    updatedAt: Date.now(),
  })

  await mkdir(path.dirname(getPlannerConfigPath()), { recursive: true })
  await writeFile(getPlannerConfigPath(), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  console.info(`[planner-config] saved provider=${normalized.provider} path=${getPlannerConfigPath()}`)

  return getPublicPlannerConfig()
}

export async function clearPlannerSecret() {
  const current = (await loadStoredPlannerConfig()) ?? PlannerProviderConfigStored.parse({ provider: 'mock' })
  const sanitized = PlannerProviderConfigStored.parse({
    ...current,
    apiKey: undefined,
    updatedAt: Date.now(),
  })

  await mkdir(path.dirname(getPlannerConfigPath()), { recursive: true })
  await writeFile(getPlannerConfigPath(), `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8')
  console.info(`[planner-config] cleared stored API key path=${getPlannerConfigPath()}`)

  return getPublicPlannerConfig()
}

export async function getResolvedPlannerConfig(): Promise<ResolvedPlannerConfig> {
  const stored = await loadStoredPlannerConfig()
  const provider = stored?.provider ?? plannerEnvDefaults.provider ?? 'mock'
  const source: ResolvedPlannerConfig['source'] = stored ? 'local' : plannerEnvDefaults.provider ? 'env' : 'default'

  if (provider === 'openai') {
    const apiKey = stored?.apiKey || plannerEnvDefaults.openai.apiKey
    return {
      provider,
      model: stored?.model || plannerEnvDefaults.openai.model || DEFAULT_PROVIDER_MODELS.openai,
      apiKey,
      source,
      ready: Boolean(apiKey),
      warning: apiKey ? undefined : 'OpenAI requires an API key.',
    }
  }

  if (provider === 'anthropic') {
    const apiKey = stored?.apiKey || plannerEnvDefaults.anthropic.apiKey
    return {
      provider,
      model: stored?.model || plannerEnvDefaults.anthropic.model || DEFAULT_PROVIDER_MODELS.anthropic,
      apiKey,
      source,
      ready: Boolean(apiKey),
      warning: apiKey ? undefined : 'Anthropic requires an API key.',
    }
  }

  if (provider === 'ollama') {
    const model = stored?.model || plannerEnvDefaults.ollama.model || DEFAULT_PROVIDER_MODELS.ollama
    const baseUrl = stored?.baseUrl || plannerEnvDefaults.ollama.baseUrl || DEFAULT_OLLAMA_BASE_URL
    const probe = await probeOllama(baseUrl, model)
    return {
      provider,
      model,
      baseUrl,
      source,
      ready: probe.ready,
      warning: probe.warning,
    }
  }

  if (provider === 'groq' || provider === 'moonshot') {
    return {
      provider,
      model: stored?.model,
      baseUrl: stored?.baseUrl,
      apiKey: stored?.apiKey,
      source,
      ready: false,
      warning: `${provider} is not implemented yet. Falling back to mock.`,
    }
  }

  return {
    provider: 'mock',
    model: DEFAULT_PROVIDER_MODELS.mock,
    source,
    ready: true,
  }
}

export async function getPublicPlannerConfig() {
  const resolved = await getResolvedPlannerConfig()

  return PlannerProviderConfigPublic.parse({
    provider: resolved.provider,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    hasApiKey: Boolean(resolved.apiKey),
    apiKeyPreview: redactSecret(resolved.apiKey),
    source: resolved.source,
    ready: resolved.ready,
    warning: resolved.warning,
  })
}

export function getPlannerConfigPath() {
  return config.RUNNER_CONFIG_PATH ? path.resolve(config.RUNNER_CONFIG_PATH) : defaultConfigPath
}

function redactSecret(secret?: string) {
  if (!secret) return undefined
  if (secret.length <= 8) return `${secret.slice(0, 2)}***`
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`
}

async function probeOllama(baseUrl: string, model: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    })

    if (!response.ok) {
      return {
        ready: false,
        warning: `Ollama endpoint responded with ${response.status} ${response.statusText}.`,
      }
    }

    const body = (await response.json()) as {
      models?: Array<{ name?: string; model?: string }>
    }

    const availableModels = (body.models ?? [])
      .map((entry) => entry.name ?? entry.model)
      .filter((entry): entry is string => Boolean(entry))

    if (availableModels.length === 0) {
      return {
        ready: false,
        warning: 'Ollama is reachable, but no local models were reported.',
      }
    }

    const normalizedTarget = normalizeModelName(model)
    const hasModel = availableModels.some((entry) => normalizeModelName(entry) === normalizedTarget)

    if (!hasModel) {
      return {
        ready: false,
        warning: `Ollama is reachable, but model "${model}" is not installed. Available: ${availableModels.slice(0, 6).join(', ')}`,
      }
    }

    return { ready: true as const }
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Ollama endpoint timed out.'
        : error instanceof Error
          ? error.message
          : String(error)

    return {
      ready: false,
      warning: `Ollama endpoint is unreachable at ${baseUrl}: ${message}`,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeModelName(model: string) {
  return model.trim().toLowerCase().replace(/:latest$/, '')
}
