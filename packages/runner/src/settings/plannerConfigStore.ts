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
    return {
      provider,
      model: stored?.model || plannerEnvDefaults.ollama.model || DEFAULT_PROVIDER_MODELS.ollama,
      baseUrl: stored?.baseUrl || plannerEnvDefaults.ollama.baseUrl || DEFAULT_OLLAMA_BASE_URL,
      source,
      ready: true,
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
    configPath: getPlannerConfigPath(),
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
