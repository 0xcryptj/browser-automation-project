import type { Locator, Page } from 'playwright'
import type { Action, CompactPageSnapshot } from '@browser-automation/shared'

export type ActionResult = {
  success: boolean
  value?: string
  screenshot?: string
  error?: string
}

type ActionHandler = (page: Page, action: Action, snapshot?: CompactPageSnapshot) => Promise<ActionResult>

const ok = (value?: string): ActionResult => ({ success: true, value })
const fail = (error: string): ActionResult => ({ success: false, error })

export const actionHandlers: Record<string, ActionHandler> = {
  goto: async (page, action) => {
    if (!action.url) return fail('goto requires a url')
    await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
    return ok(`Navigated to ${action.url}`)
  },

  click: async (page, action, snapshot) => {
    const target = resolveTarget(action, snapshot)
    if (!target.selector) return fail('click requires a selector or elementRef')
    const locator = await findFirstVisible(page, target.selector)
    await locator.click()
    return ok(`Clicked ${target.label}`)
  },

  type: async (page, action, snapshot) => {
    const target = resolveTarget(action, snapshot)
    if (!target.selector) return fail('type requires a selector or elementRef')
    if (action.value === undefined) return fail('type requires a value')
    const locator = await findFirstVisible(page, target.selector)
    await locator.fill(action.value)
    return ok(`Typed "${action.value}" into ${target.label}`)
  },

  select: async (page, action, snapshot) => {
    const target = resolveTarget(action, snapshot)
    if (!target.selector) return fail('select requires a selector or elementRef')
    if (!action.value) return fail('select requires a value')
    const locator = await findFirstVisible(page, target.selector)
    await locator.selectOption(action.value)
    return ok(`Selected "${action.value}" in ${target.label}`)
  },

  scroll: async (page, action) => {
    const direction = action.direction ?? 'down'
    const amount = action.amount ?? 500
    const delta = direction === 'down' || direction === 'right' ? amount : -amount
    const axis = direction === 'left' || direction === 'right' ? 'x' : 'y'
    await page.evaluate(
      ({ resolvedAxis, resolvedDelta }) =>
        window.scrollBy(resolvedAxis === 'x' ? resolvedDelta : 0, resolvedAxis === 'y' ? resolvedDelta : 0),
      { resolvedAxis: axis, resolvedDelta: delta }
    )
    return ok(`Scrolled ${direction} by ${amount}px`)
  },

  hover: async (page, action, snapshot) => {
    const target = resolveTarget(action, snapshot)
    if (!target.selector) return fail('hover requires a selector or elementRef')
    const locator = await findFirstVisible(page, target.selector)
    await locator.hover()
    return ok(`Hovered over ${target.label}`)
  },

  press: async (page, action, snapshot) => {
    if (!action.key) return fail('press requires a key')
    const target = resolveTarget(action, snapshot)
    if (target.selector) {
      const locator = await findFirstVisible(page, target.selector)
      await locator.press(action.key)
      return ok(`Pressed ${action.key} on ${target.label}`)
    }

    await page.keyboard.press(action.key)
    return ok(`Pressed ${action.key}`)
  },

  pressKey: async (page, action) => {
    return actionHandlers.press(page, action)
  },

  wait_for_selector: async (page, action, snapshot) => {
    const target = resolveTarget(action, snapshot)
    if (!target.selector) return fail('wait_for_selector requires a selector or elementRef')
    await findFirstVisible(page, target.selector, 15_000)
    return ok(`Selector "${target.label}" is visible`)
  },

  wait_for_text: async (page, action) => {
    if (!action.value) return fail('wait_for_text requires a value')
    await page.getByText(action.value, { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 })
    return ok(`Text "${action.value}" found on page`)
  },

  extract: async (page, action, snapshot) => {
    const target = resolveTarget(action, snapshot, 'main, article, [role="main"], body')
    const selector = target.selector ?? 'main, article, [role="main"], body'
    const locator = await findFirstVisible(page, selector)
    const text = ((await locator.innerText()).trim() || '').replace(/\s+/g, ' ').slice(0, 4000)
    return ok(text)
  },

  screenshot: async (page) => {
    const buffer = await page.screenshot({ type: 'png', fullPage: false })
    const b64 = buffer.toString('base64')
    return { success: true, screenshot: b64, value: 'Screenshot captured' }
  },
}

export async function runAction(page: Page, action: Action, snapshot?: CompactPageSnapshot): Promise<ActionResult> {
  const handler = actionHandlers[action.type]
  if (!handler) return { success: false, error: `Unknown action type: ${action.type}` }
  try {
    return await handler(page, action, snapshot)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

async function findFirstVisible(page: Page, selector: string, timeout = 10_000): Promise<Locator> {
  const directLocator = page.locator(selector).first()
  try {
    await directLocator.waitFor({ state: 'visible', timeout: Math.min(timeout, 2_500) })
    await directLocator.scrollIntoViewIfNeeded().catch(() => {})
    return directLocator
  } catch (error) {
    // Fall back to trying individual selector candidates below.
    void error
  }

  const selectors = selector
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)

  let lastError: unknown = null
  const timeoutPerCandidate = Math.max(750, Math.floor(timeout / Math.max(selectors.length, 1)))

  for (const candidate of selectors) {
    const locator = page.locator(candidate).first()
    try {
      await locator.waitFor({ state: 'visible', timeout: timeoutPerCandidate })
      await locator.scrollIntoViewIfNeeded().catch(() => {})
      return locator
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`No visible element found for ${selector}`)
}

function resolveTarget(action: Action, snapshot?: CompactPageSnapshot, fallbackSelector?: string) {
  const fromRef =
    action.elementRef && snapshot
      ? snapshot.elements.find((element) => element.ref === action.elementRef)
        ?? snapshot.forms.flatMap((form) => form.fields).find((field) => field.ref === action.elementRef)
      : undefined

  const selector = action.selector ?? fromRef?.selector ?? fallbackSelector
  const label =
    fromRef && 'label' in fromRef
      ? fromRef.label ?? fromRef.name ?? fromRef.text ?? selector ?? action.elementRef ?? 'target'
      : selector ?? action.elementRef ?? 'target'

  return { selector, label }
}
