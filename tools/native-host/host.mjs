import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, openSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const runtimeDir = resolve(repoRoot, 'packages', 'runner', '.local')
const logPath = join(runtimeDir, 'runner-autostart.log')

mkdirSync(runtimeDir, { recursive: true })

function writeNativeMessage(message) {
  const json = Buffer.from(JSON.stringify(message), 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32LE(json.length, 0)
  process.stdout.write(header)
  process.stdout.write(json)
}

function readNativeMessage() {
  return new Promise((resolveMessage, reject) => {
    let chunks = Buffer.alloc(0)

    process.stdin.on('data', (chunk) => {
      chunks = Buffer.concat([chunks, chunk])

      if (chunks.length < 4) {
        return
      }

      const messageLength = chunks.readUInt32LE(0)
      if (chunks.length < 4 + messageLength) {
        return
      }

      try {
        const body = chunks.subarray(4, 4 + messageLength).toString('utf8')
        resolveMessage(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })

    process.stdin.on('error', reject)
    process.stdin.resume()
  })
}

async function fetchHealth(runnerBaseUrl) {
  const response = await fetch(`${runnerBaseUrl.replace(/\/$/, '')}/health`)
  if (!response.ok) {
    throw new Error(`Runner health failed with ${response.status} ${response.statusText}`)
  }
  return response.json()
}

async function waitForHealth(runnerBaseUrl, timeoutMs = 20000) {
  const startedAt = Date.now()
  let lastError = 'Runner did not become healthy in time.'

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await fetchHealth(runnerBaseUrl)
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
    }
  }

  throw new Error(lastError)
}

async function waitForCdp(cdpUrl, timeoutMs = 20000) {
  const startedAt = Date.now()
  let lastError = 'Browser attach mode did not become reachable in time.'

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${cdpUrl.replace(/\/$/, '')}/json/version`)
      if (!response.ok) {
        lastError = `Browser CDP endpoint responded with ${response.status} ${response.statusText}`
      } else {
        const data = await response.json().catch(() => ({}))
        return {
          ok: true,
          version: data,
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
  }

  throw new Error(lastError)
}

function launchRunner(runnerBaseUrl) {
  const port = safePort(runnerBaseUrl)
  const outFd = openSync(logPath, 'a')
  const errFd = openSync(logPath, 'a')
  const nodeExe = resolveNodeExecutable()
  const tsxCli = resolveTsxCli()
  const runnerEntry = join(repoRoot, 'packages', 'runner', 'src', 'index.ts')

  const child = spawn(
    nodeExe,
    [tsxCli, runnerEntry],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        RUNNER_PORT: String(port),
      },
      detached: true,
      stdio: ['ignore', outFd, errFd],
      windowsHide: true,
    }
  )

  child.unref()
}

function resolveNodeExecutable() {
  const candidates = [
    process.env.NODE_PATH,
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
  ]

  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? 'node.exe'
}

function resolveTsxCli() {
  const candidates = [
    join(repoRoot, 'node_modules', '.pnpm', 'tsx@4.21.0', 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  ]

  const resolved = candidates.find((candidate) => existsSync(candidate))
  if (!resolved) {
    throw new Error('Could not find tsx cli.mjs for silent runner startup.')
  }
  return resolved
}

function safePort(runnerBaseUrl) {
  try {
    return new URL(runnerBaseUrl).port || '3000'
  } catch {
    return '3000'
  }
}

async function ensureRunner(runnerBaseUrl) {
  try {
    const health = await fetchHealth(runnerBaseUrl)
    return {
      ok: true,
      launched: false,
      health,
      logPath,
    }
  } catch {
    // continue to launch
  }

  launchRunner(runnerBaseUrl)
  const health = await waitForHealth(runnerBaseUrl)

  return {
    ok: true,
    launched: true,
    health,
    logPath,
  }
}

function stopBrowserProcesses(browser) {
  const processNames =
    browser === 'brave'
      ? ['brave.exe', 'BraveCrashHandler.exe']
      : ['chrome.exe']

  for (const processName of processNames) {
    spawnSync('taskkill.exe', ['/IM', processName, '/F', '/T'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  }
}

function resolveBrowserExecutable(browser) {
  const candidates =
    browser === 'brave'
      ? [
          process.env.BRAVE_PATH,
          'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
          'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
          join(process.env.LOCALAPPDATA ?? '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        ]
      : [
          process.env.CHROME_PATH,
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ]

  return candidates.find((candidate) => candidate && existsSync(candidate))
}

function safePortFromCdpUrl(cdpUrl) {
  try {
    return new URL(cdpUrl).port || '9222'
  } catch {
    return '9222'
  }
}

function launchBrowserForAttach(browser, cdpUrl) {
  const executable = resolveBrowserExecutable(browser)
  if (!executable) {
    throw new Error(
      browser === 'brave'
        ? 'Could not find Brave. Install Brave or set BRAVE_PATH before using attach mode.'
        : 'Could not find Chrome. Install Chrome or set CHROME_PATH before using attach mode.'
    )
  }

  const port = safePortFromCdpUrl(cdpUrl)
  const args = [`--remote-debugging-port=${port}`, '--new-window', 'about:blank']

  const child = spawn(executable, args, {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })

  child.unref()

  return {
    executable,
    args,
  }
}

async function ensureBrowserAttach({ browser = 'brave', cdpUrl = 'http://127.0.0.1:9222' } = {}) {
  try {
    const connected = await waitForCdp(cdpUrl, 1500)
    return {
      ok: true,
      launched: false,
      browser,
      cdpUrl,
      connected,
      logPath,
    }
  } catch {
    // continue to restart flow
  }

  stopBrowserProcesses(browser)
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1200))
  const launch = launchBrowserForAttach(browser, cdpUrl)
  const connected = await waitForCdp(cdpUrl, 20000)

  return {
    ok: true,
    launched: true,
    browser,
    cdpUrl,
    executable: launch.executable,
    connected,
    logPath,
  }
}

async function main() {
  try {
    const message = await readNativeMessage()

    if (message?.type === 'ensure-runner') {
      const runnerBaseUrl =
        typeof message.runnerBaseUrl === 'string' && message.runnerBaseUrl.trim()
          ? message.runnerBaseUrl
          : 'http://127.0.0.1:3000'

      const result = await ensureRunner(runnerBaseUrl)
      writeNativeMessage(result)
      return
    }

    if (message?.type === 'ensure-browser-attach') {
      const browser =
        message.browser === 'chrome' || message.browser === 'brave'
          ? message.browser
          : 'brave'
      const cdpUrl =
        typeof message.cdpUrl === 'string' && message.cdpUrl.trim()
          ? message.cdpUrl
          : 'http://127.0.0.1:9222'

      const result = await ensureBrowserAttach({ browser, cdpUrl })
      writeNativeMessage(result)
      return
    }

    writeNativeMessage({
      ok: false,
      error: `Unsupported native host command: ${String(message?.type ?? 'unknown')}`,
      logPath,
    })
  } catch (error) {
    writeNativeMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      logPath,
    })
  }
}

void main()
