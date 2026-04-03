/// <reference types="chrome" />
import { DEFAULT_SETTINGS } from '@browser-automation/shared'

const NATIVE_HOST_NAME = 'com.browser_automation.host'
let lastOverlayTabIds: number[] = []

async function getRunnerBaseUrl(): Promise<string> {
  try {
    const stored = await chrome.storage.sync.get('settings')
    const runnerBaseUrl =
      typeof stored.settings?.runnerBaseUrl === 'string'
        ? stored.settings.runnerBaseUrl
        : DEFAULT_SETTINGS.runnerBaseUrl
    return runnerBaseUrl.replace(/\/$/, '')
  } catch {
    return DEFAULT_SETTINGS.runnerBaseUrl
  }
}

async function shouldAutoStartRunner() {
  try {
    const stored = await chrome.storage.sync.get('settings')
    return stored.settings?.autoStartRunner !== false
  } catch {
    return DEFAULT_SETTINGS.autoStartRunner
  }
}

function getTabAccessIssue(url?: string) {
  if (!url) {
    return 'The active tab does not expose a readable URL yet.'
  }

  const restrictedPrefixes = ['chrome://', 'chrome-extension://', 'edge://', 'brave://', 'about:']
  const blocked = restrictedPrefixes.find((prefix) => url.startsWith(prefix))
  if (blocked) {
    return `This page is restricted by the browser (${blocked}) and the assistant cannot inspect it.`
  }

  return null
}

async function fetchRunnerHealth(runnerUrl: string) {
  const response = await fetch(`${runnerUrl}/health`)
  if (!response.ok) {
    throw new Error(`Runner health failed with ${response.status} ${response.statusText}`)
  }
  return response.json()
}

function sendNativeHostMessage<T>(payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, payload, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve((response ?? {}) as T)
      })
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

async function ensureRunnerStarted(runnerUrl: string) {
  try {
    const health = await fetchRunnerHealth(runnerUrl)
    return { ok: true, launched: false, health }
  } catch {
    // Fall through to native host bootstrap.
  }

  try {
    const response = await sendNativeHostMessage<{
      ok?: boolean
      launched?: boolean
      error?: string
      helperCommand?: string
      logPath?: string
      health?: unknown
    }>({
      type: 'ensure-runner',
      runnerBaseUrl: runnerUrl,
      extensionId: chrome.runtime.id,
    })

    if (response.ok) {
      return {
        ok: true,
        launched: Boolean(response.launched),
        health: response.health,
        logPath: response.logPath,
      }
    }

    return {
      ok: false,
      error: response.error ?? 'Could not start the local runner.',
      helperCommand: response.helperCommand,
      logPath: response.logPath,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: `Automatic local startup is unavailable: ${message}`,
      helperCommand: `powershell -ExecutionPolicy Bypass -File .\\tools\\native-host\\install-native-host.ps1 -ExtensionId ${chrome.runtime.id}`,
    }
  }
}

async function ensureBrowserAttach(browser: 'brave' | 'chrome', cdpUrl?: string) {
  try {
    const response = await sendNativeHostMessage<{
      ok?: boolean
      launched?: boolean
      browser?: 'brave' | 'chrome'
      cdpUrl?: string
      executable?: string
      error?: string
      logPath?: string
    }>({
      type: 'ensure-browser-attach',
      browser,
      cdpUrl,
    })

    if (response.ok) {
      return {
        ok: true,
        launched: Boolean(response.launched),
        browser: response.browser ?? browser,
        cdpUrl: response.cdpUrl ?? cdpUrl,
        executable: response.executable,
        logPath: response.logPath,
      }
    }

    return {
      ok: false,
      error: response.error ?? `Could not restart ${browser} for attach mode.`,
      logPath: response.logPath,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: `Automatic browser attach is unavailable: ${message}`,
      helperCommand: `powershell -ExecutionPolicy Bypass -File .\\tools\\native-host\\install-native-host.ps1 -ExtensionId ${chrome.runtime.id}`,
    }
  }
}

async function maybeEnsureRunnerOnOpen() {
  const autoStart = await shouldAutoStartRunner()
  if (!autoStart) return

  const runnerUrl = await getRunnerBaseUrl()
  await ensureRunnerStarted(runnerUrl).catch(() => {})
}

function normalizeUrl(url?: string | null) {
  return (url ?? '').trim().replace(/\/$/, '').toLowerCase()
}

async function findOverlayTargetTabs(pageUrl?: string) {
  const tabs = await chrome.tabs.query({ currentWindow: true })
  const candidateTabs = tabs.filter((tab) => typeof tab.id === 'number')
  const normalizedTarget = normalizeUrl(pageUrl)

  if (normalizedTarget) {
    const exactMatches = candidateTabs.filter((tab) => normalizeUrl(tab.url) === normalizedTarget)
    if (exactMatches.length > 0) {
      return exactMatches
        .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))
        .map((tab) => tab.id!)
    }
  }

  const activeTab = candidateTabs.find((tab) => tab.active)
  return activeTab?.id ? [activeTab.id] : []
}

async function sendOverlayMessageToTabs(
  tabIds: number[],
  message: { type: 'TASK_OVERLAY_SHOW' | 'TASK_OVERLAY_CLEAR'; payload?: Record<string, unknown> }
) {
  const uniqueIds = [...new Set(tabIds)]
  let delivered = 0
  let lastErrorMessage: string | null = null

  await Promise.all(
    uniqueIds.map(
      (tabId) =>
        new Promise<void>((resolve) => {
          chrome.tabs.sendMessage(tabId, message, () => {
            if (chrome.runtime.lastError) {
              lastErrorMessage = chrome.runtime.lastError.message ?? 'Could not reach the page content script.'
            } else {
              delivered += 1
            }
            resolve()
          })
        })
    )
  )

  return { delivered, lastErrorMessage }
}

// Open side panel when the action button is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    void maybeEnsureRunnerOnOpen()
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
      // Brave and some Chromium forks may throw on restricted tabs (brave://, etc.)
    })
  }
})

// Set the side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)

chrome.runtime.onStartup.addListener(() => {
  void maybeEnsureRunnerOnOpen()
})

chrome.runtime.onInstalled.addListener(() => {
  void maybeEnsureRunnerOnOpen()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return
  if (message.type === 'TASK_OVERLAY_SHOW' || message.type === 'TASK_OVERLAY_CLEAR') {
    const payload = typeof message.payload === 'object' && message.payload ? message.payload : undefined
    const pageUrl = typeof payload?.pageUrl === 'string' ? payload.pageUrl : undefined

    ;(async () => {
      const targetIds =
        message.type === 'TASK_OVERLAY_SHOW'
          ? await findOverlayTargetTabs(pageUrl)
          : lastOverlayTabIds

      if (targetIds.length === 0) {
        sendResponse({ ok: false, error: 'No matching browser tab was available for the overlay.' })
        return
      }

      const result = await sendOverlayMessageToTabs(targetIds, message)
      if (result.delivered > 0) {
        if (message.type === 'TASK_OVERLAY_SHOW') {
          lastOverlayTabIds = targetIds
        } else {
          lastOverlayTabIds = []
        }
        sendResponse({ ok: true, delivered: result.delivered })
        return
      }

      if (message.type === 'TASK_OVERLAY_CLEAR') {
        lastOverlayTabIds = []
      }
      sendResponse({ ok: false, error: result.lastErrorMessage ?? 'Could not reach the target browser tab.' })
    })()
    return true
  }

  if (message.type === 'GET_PAGE_CONTEXT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        sendResponse({ error: 'No active tab' })
        return
      }
      const accessIssue = getTabAccessIssue(tab.url)
      if (accessIssue) {
        sendResponse({
          error: accessIssue,
          url: tab.url ?? '',
          title: tab.title ?? '',
          restricted: true,
        })
        return
      }
      chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_CONTEXT', options: message.options }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            error: chrome.runtime.lastError.message ?? 'Could not reach the page content script.',
            url: tab.url ?? '',
            title: tab.title ?? '',
            restricted: false,
          })
        } else {
          sendResponse(response)
        }
      })
    })
    return true
  }

  if (message.type === 'RUNNER_HEALTH') {
    getRunnerBaseUrl()
      .then(async (runnerUrl) => {
        return fetchRunnerHealth(runnerUrl)
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    return true
  }

  if (message.type === 'ENSURE_RUNNER') {
    getRunnerBaseUrl()
      .then((runnerUrl) => ensureRunnerStarted(runnerUrl))
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
      )
    return true
  }

  if (message.type === 'ENSURE_BROWSER_ATTACH') {
    ensureBrowserAttach(
      message.browser === 'chrome' ? 'chrome' : 'brave',
      typeof message.cdpUrl === 'string' ? message.cdpUrl : undefined
    )
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
      )
    return true
  }

  if (message.type === 'SEND_TASK') {
    getRunnerBaseUrl()
      .then(async (runnerUrl) => {
        const response = await fetch(`${runnerUrl}/task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.payload),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : `Task request failed with ${response.status}`)
        }
        return data
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true
  }

  if (message.type === 'APPROVE_STEP') {
    const { taskId, stepIndex, approved } = message.payload
    getRunnerBaseUrl()
      .then((runnerUrl) =>
        fetch(`${runnerUrl}/task/${taskId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, stepIndex, approved }),
        })
      )
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true
  }

  if (message.type === 'OVERLAY_CANCEL_TASK') {
    const { taskId } = message.payload ?? {}
    if (!taskId || typeof taskId !== 'string') {
      sendResponse({ ok: false, error: 'Missing taskId' })
      return true
    }

    getRunnerBaseUrl()
      .then((runnerUrl) =>
        fetch(`${runnerUrl}/task/${taskId}/cancel`, {
          method: 'POST',
        })
      )
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true
  }
})
