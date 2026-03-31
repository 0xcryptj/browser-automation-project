/// <reference types="chrome" />

const RUNNER_URL = 'http://127.0.0.1:3000'

// Open side panel when the action button is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id })
  }
})

// Set the side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)

// ── Message broker between side panel and content script ─────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_CONTEXT') {
    // Request page context from the active content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        sendResponse({ error: 'No active tab' })
        return
      }
      chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_CONTEXT' }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ url: tab.url ?? '', title: tab.title ?? '' })
        } else {
          sendResponse(response)
        }
      })
    })
    return true // async
  }

  if (message.type === 'RUNNER_HEALTH') {
    fetch(`${RUNNER_URL}/health`)
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }

  if (message.type === 'SEND_TASK') {
    fetch(`${RUNNER_URL}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true
  }

  if (message.type === 'APPROVE_STEP') {
    const { taskId, stepIndex, approved } = message.payload
    fetch(`${RUNNER_URL}/task/${taskId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, stepIndex, approved }),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true
  }
})
