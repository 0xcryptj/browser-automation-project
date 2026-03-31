import type { Page } from 'playwright'
import { buildPageObservationScript, getDefaultObservationOptions } from '@browser-automation/shared'
import type { ObservationOptions, PageObservation } from '@browser-automation/shared'

export async function observe(
  page: Page,
  captureScreenshot = false,
  options: ObservationOptions = getDefaultObservationOptions('task')
): Promise<PageObservation> {
  const snapshot = await page.evaluate(buildPageObservationScript(options), options)

  let screenshot: string | undefined
  if (captureScreenshot) {
    const buf = await page.screenshot({ type: 'png' })
    screenshot = buf.toString('base64')
  }

  return {
    ...snapshot,
    screenshot,
  }
}
