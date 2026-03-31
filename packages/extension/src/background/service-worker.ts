/// <reference types="chrome" />
import { DEFAULT_SETTINGS } from '@browser-automation/shared'

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

// Open side panel when the action button is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id })
  }
})

// Set the side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TASK_OVERLAY_SHOW' || message.type === 'TASK_OVERLAY_CLEAR') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        sendResponse({ ok: false, error: 'No active tab' })
        return
      }

      chrome.tabs.sendMessage(tab.id, message, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message })
          return
        }

        sendResponse({ ok: true })
      })
    })
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
        const response = await fetch(`${runnerUrl}/health`)
        if (!response.ok) {
          throw new Error(`Runner health failed with ${response.status} ${response.statusText}`)
        }
        return response.json()
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }))
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
})
