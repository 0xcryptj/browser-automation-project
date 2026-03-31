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

// Open side panel when the action button is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id })
  }
})

// Set the side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_CONTEXT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        sendResponse({ error: 'No active tab' })
        return
      }
      chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_CONTEXT', options: message.options }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ url: tab.url ?? '', title: tab.title ?? '' })
        } else {
          sendResponse(response)
        }
      })
    })
    return true
  }

  if (message.type === 'RUNNER_HEALTH') {
    getRunnerBaseUrl()
      .then((runnerUrl) => fetch(`${runnerUrl}/health`))
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }

  if (message.type === 'SEND_TASK') {
    getRunnerBaseUrl()
      .then((runnerUrl) =>
        fetch(`${runnerUrl}/task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.payload),
        })
      )
      .then((r) => r.json())
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
