import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BrowserConnectionConfigInput,
  BrowserConnectionConfigPublic,
  BrowserConnectionConfigStored,
} from '@browser-automation/shared'
import { config } from '../config.js'

type ResolvedBrowserConfig = {
  mode: 'launch' | 'attach'
  cdpUrl?: string
  source: 'default' | 'env' | 'local'
  ready: boolean
  warning?: string
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const defaultConfigPath = path.join(packageRoot, '.local', 'browser-config.json')

export async function loadStoredBrowserConfig() {
  try {
    const raw = await readFile(getBrowserConfigPath(), 'utf8')
    const parsed = JSON.parse(raw)
    const result = BrowserConnectionConfigStored.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export async function saveBrowserConfig(input: unknown) {
  const parsed = BrowserConnectionConfigInput.parse(input)
  const normalized = BrowserConnectionConfigStored.parse({
    mode: parsed.mode,
    cdpUrl: parsed.cdpUrl?.trim() || undefined,
    updatedAt: Date.now(),
  })

  await mkdir(path.dirname(getBrowserConfigPath()), { recursive: true })
  await writeFile(getBrowserConfigPath(), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  console.info(`[browser-config] saved mode=${normalized.mode} path=${getBrowserConfigPath()}`)

  return getPublicBrowserConfig()
}

export async function getResolvedBrowserConfig(): Promise<ResolvedBrowserConfig> {
  const stored = await loadStoredBrowserConfig()
  const mode = stored?.mode ?? config.BROWSER_CONNECTION_MODE
  const cdpUrl = stored?.cdpUrl ?? config.BROWSER_CDP_URL
  const source: ResolvedBrowserConfig['source'] = stored ? 'local' : config.BROWSER_CONNECTION_MODE ? 'env' : 'default'

  if (mode === 'attach') {
    const probe = await probeCdp(cdpUrl)
    return {
      mode,
      cdpUrl,
      source,
      ready: probe.ready,
      warning: probe.warning,
    }
  }

  return {
    mode: 'launch',
    source,
    ready: true,
  }
}

export async function getPublicBrowserConfig() {
  const resolved = await getResolvedBrowserConfig()
  return BrowserConnectionConfigPublic.parse(resolved)
}

export function getBrowserConfigPath() {
  return config.RUNNER_CONFIG_PATH
    ? path.resolve(path.dirname(config.RUNNER_CONFIG_PATH), 'browser-config.json')
    : defaultConfigPath
}

async function probeCdp(cdpUrl: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1800)

  try {
    const response = await fetch(`${cdpUrl.replace(/\/$/, '')}/json/version`, {
      method: 'GET',
      signal: controller.signal,
    })

    if (!response.ok) {
      return {
        ready: false,
        warning: `Browser CDP endpoint responded with ${response.status} ${response.statusText}.`,
      }
    }

    return { ready: true as const }
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Browser CDP endpoint timed out.'
        : error instanceof Error
          ? error.message
          : String(error)

    return {
      ready: false,
      warning: `Browser attach mode is not reachable at ${cdpUrl}: ${message}`,
    }
  } finally {
    clearTimeout(timeout)
  }
}
