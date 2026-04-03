import type { Page } from 'playwright'
import { buildPageObservationScript, getDefaultObservationOptions } from '@browser-automation/shared'
import type { ObservationOptions, PageObservation } from '@browser-automation/shared'

export async function observe(
  page: Page,
  captureScreenshot = false,
  options: ObservationOptions = getDefaultObservationOptions('task')
): Promise<PageObservation> {
  let snapshot: Omit<PageObservation, 'screenshot'>

  try {
    snapshot = await page.evaluate(buildPageObservationScript(options), options)
  } catch (err) {
    // The page may have navigated mid-evaluation or be in an error state.
    // Return a minimal observation so the executor can continue gracefully.
    const url = page.url()
    const title = await page.title().catch(() => '')
    snapshot = {
      url,
      title,
      timestamp: Date.now(),
    }
    if (err instanceof Error && !err.message.includes('Execution context was destroyed')) {
      // Re-throw unexpected errors (e.g. serialization failures in the script itself)
      throw err
    }
  }

  let screenshot: string | undefined
  if (captureScreenshot) {
    try {
      const buf = await page.screenshot({ type: 'png' })
      screenshot = buf.toString('base64')
    } catch {
      // Screenshot failure is non-fatal — the observation is still useful without it
    }
  }

  return {
    ...snapshot,
    screenshot,
  }
}
