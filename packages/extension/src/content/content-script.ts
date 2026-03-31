/// <reference types="chrome" />
import { buildPageObservationScript, getDefaultObservationOptions } from '@browser-automation/shared'
import type { ObservationOptions } from '@browser-automation/shared'

function collectContext(options?: Partial<ObservationOptions>) {
  const resolvedOptions = { ...getDefaultObservationOptions('task'), ...options }
  return buildPageObservationScript(resolvedOptions)(resolvedOptions)
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'COLLECT_CONTEXT') {
    sendResponse(collectContext(message.options))
    return true
  }
})
