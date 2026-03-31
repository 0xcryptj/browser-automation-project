import type { Page } from 'playwright'
import type { Action } from '@browser-automation/shared'

export type ActionResult = {
  success: boolean
  value?: string
  screenshot?: string // base64
  error?: string
}

type ActionHandler = (page: Page, action: Action) => Promise<ActionResult>

const ok = (value?: string): ActionResult => ({ success: true, value })
const fail = (error: string): ActionResult => ({ success: false, error })

export const actionHandlers: Record<string, ActionHandler> = {
  goto: async (page, action) => {
    if (!action.url) return fail('goto requires a url')
    await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    return ok(`Navigated to ${action.url}`)
  },

  click: async (page, action) => {
    if (!action.selector) return fail('click requires a selector')
    await page.waitForSelector(action.selector, { timeout: 10_000 })
    await page.click(action.selector)
    return ok(`Clicked ${action.selector}`)
  },

  type: async (page, action) => {
    if (!action.selector) return fail('type requires a selector')
    if (action.value === undefined) return fail('type requires a value')
    await page.waitForSelector(action.selector, { timeout: 10_000 })
    await page.fill(action.selector, action.value)
    return ok(`Typed "${action.value}" into ${action.selector}`)
  },

  select: async (page, action) => {
    if (!action.selector) return fail('select requires a selector')
    if (!action.value) return fail('select requires a value')
    await page.waitForSelector(action.selector, { timeout: 10_000 })
    await page.selectOption(action.selector, action.value)
    return ok(`Selected "${action.value}" in ${action.selector}`)
  },

  scroll: async (page, action) => {
    const direction = action.direction ?? 'down'
    const amount = action.amount ?? 500
    const delta = direction === 'down' || direction === 'right' ? amount : -amount
    const axis = direction === 'left' || direction === 'right' ? 'x' : 'y'
    await page.evaluate(
      ({ axis, delta }) => window.scrollBy(axis === 'x' ? delta : 0, axis === 'y' ? delta : 0),
      { axis, delta }
    )
    return ok(`Scrolled ${direction} by ${amount}px`)
  },

  hover: async (page, action) => {
    if (!action.selector) return fail('hover requires a selector')
    await page.waitForSelector(action.selector, { timeout: 10_000 })
    await page.hover(action.selector)
    return ok(`Hovered over ${action.selector}`)
  },

  press: async (page, action) => {
    if (!action.key) return fail('press requires a key')
    const target = action.selector ?? 'body'
    if (action.selector) {
      await page.waitForSelector(action.selector, { timeout: 10_000 })
    }
    await page.press(target, action.key)
    return ok(`Pressed ${action.key}`)
  },

  wait_for_selector: async (page, action) => {
    if (!action.selector) return fail('wait_for_selector requires a selector')
    await page.waitForSelector(action.selector, { timeout: 15_000 })
    return ok(`Selector "${action.selector}" is visible`)
  },

  wait_for_text: async (page, action) => {
    if (!action.value) return fail('wait_for_text requires a value')
    await page.waitForSelector(`text=${action.value}`, { timeout: 15_000 })
    return ok(`Text "${action.value}" found on page`)
  },

  extract: async (page, action) => {
    const selector = action.selector ?? 'body'
    await page.waitForSelector(selector, { timeout: 10_000 })
    const text = await page.$eval(selector, (el) => (el as HTMLElement).innerText?.trim() ?? '')
    return ok(text)
  },

  screenshot: async (page, _action) => {
    const buffer = await page.screenshot({ type: 'png', fullPage: false })
    const b64 = buffer.toString('base64')
    return { success: true, screenshot: b64, value: 'Screenshot captured' }
  },
}

export async function runAction(page: Page, action: Action): Promise<ActionResult> {
  const handler = actionHandlers[action.type]
  if (!handler) return { success: false, error: `Unknown action type: ${action.type}` }
  try {
    return await handler(page, action)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
