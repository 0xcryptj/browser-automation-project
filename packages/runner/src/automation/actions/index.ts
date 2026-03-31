import type { Locator, Page } from 'playwright'
import type { Action, CompactPageSnapshot, TaskContext } from '@browser-automation/shared'

export type ActionResult = {
  success: boolean
  value?: string
  screenshot?: string
  error?: string
}

type ActionHandler = (page: Page, action: Action, context?: TaskContext) => Promise<ActionResult>

const ok = (value?: string): ActionResult => ({ success: true, value })
const fail = (error: string): ActionResult => ({ success: false, error })

export const actionHandlers: Record<string, ActionHandler> = {
  goto: async (page, action) => {
    if (!action.url) return fail('goto requires a url')
    await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
    return ok(`Navigated to ${action.url}`)
  },

  click: async (page, action, context) => {
    const target = resolveTarget(action, context?.snapshot)
    const locator = await findBestTargetLocator(page, action, context)
    await locator.click()
    return ok(`Clicked ${target.label}`)
  },

  type: async (page, action, context) => {
    const target = resolveTarget(action, context?.snapshot)
    if (action.value == null) return fail('type requires a value')
    const locator = await findBestTargetLocator(page, action, context)
    const contentEditable = await locator
      .evaluate((node) => node instanceof HTMLElement && node.isContentEditable)
      .catch(() => false)

    if (contentEditable) {
      await locator.click()
      await page.keyboard.press('Control+A').catch(() => {})
      await page.keyboard.insertText(action.value)
    } else {
      await locator.fill(action.value)
    }
    return ok(`Typed "${action.value}" into ${target.label}`)
  },

  select: async (page, action, context) => {
    const target = resolveTarget(action, context?.snapshot)
    if (!action.value) return fail('select requires a value')
    const locator = await findBestTargetLocator(page, action, context)
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

  hover: async (page, action, context) => {
    const target = resolveTarget(action, context?.snapshot)
    const locator = await findBestTargetLocator(page, action, context)
    await locator.hover()
    return ok(`Hovered over ${target.label}`)
  },

  press: async (page, action, context) => {
    if (!action.key) return fail('press requires a key')
    const target = resolveTarget(action, context?.snapshot)
    if (target.selector || action.elementRef) {
      const locator = await findBestTargetLocator(page, action, context)
      await locator.press(action.key)
      return ok(`Pressed ${action.key} on ${target.label}`)
    }

    await page.keyboard.press(action.key)
    return ok(`Pressed ${action.key}`)
  },

  pressKey: async (page, action) => {
    return actionHandlers.press(page, action)
  },

  wait_for_selector: async (page, action, context) => {
    const target = resolveTarget(action, context?.snapshot)
    await findBestTargetLocator(page, action, context, 15_000)
    return ok(`Selector "${target.label}" is visible`)
  },

  wait_for_text: async (page, action) => {
    if (!action.value) return fail('wait_for_text requires a value')
    await page.getByText(action.value, { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 })
    return ok(`Text "${action.value}" found on page`)
  },

  extract: async (page, action, context) => {
    const target = resolveTarget(action, context?.snapshot, 'main, article, [role="main"], body')
    const text = await extractText(page, target.selector, context, action.elementRef)
    return ok(text)
  },

  screenshot: async (page) => {
    const buffer = await page.screenshot({ type: 'png', fullPage: false })
    const b64 = buffer.toString('base64')
    return { success: true, screenshot: b64, value: 'Screenshot captured' }
  },
}

export async function runAction(page: Page, action: Action, context?: TaskContext): Promise<ActionResult> {
  const handler = actionHandlers[action.type]
  if (!handler) return { success: false, error: `Unknown action type: ${action.type}` }
  try {
    return await handler(page, action, context)
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

async function findBestTargetLocator(
  page: Page,
  action: Action,
  context?: TaskContext,
  timeout = 10_000
): Promise<Locator> {
  const target = resolveTarget(action, context?.snapshot)
  const fallbackSelector = action.selector ?? target.element?.selector ?? null
  const candidates = [
    ...(fallbackSelector ? buildSelectorLocators(page, fallbackSelector) : []),
    ...buildSemanticLocators(page, target.element, action),
  ]

  if (candidates.length === 0) {
    throw new Error(`${action.type} requires a selector or elementRef`)
  }

  let lastError: unknown = null
  const timeoutPerCandidate = Math.max(700, Math.floor(timeout / candidates.length))

  for (const locator of candidates) {
    try {
      await locator.waitFor({ state: 'visible', timeout: timeoutPerCandidate })
      await locator.scrollIntoViewIfNeeded().catch(() => {})
      return locator
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Could not find a visible target for ${target.label}`)
}

function buildSelectorLocators(page: Page, selector: string) {
  return selector
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => page.locator(candidate).first())
}

function buildSemanticLocators(
  page: Page,
  element: ResolvedTargetElement | undefined,
  action: Action
) {
  if (!element) {
    return []
  }

  const locators: Locator[] = []
  const textLabel = firstNonEmpty(element.label, element.text, element.name, element.placeholder)
  const cssTag = kindToCssTag(element.kind)

  if (cssTag && element.name) {
    locators.push(page.locator(`${cssTag}[name="${escapeCssValue(element.name)}"]`).first())
  }
  if (cssTag && element.placeholder) {
    locators.push(page.locator(`${cssTag}[placeholder="${escapeCssValue(element.placeholder)}"]`).first())
  }
  if (cssTag && element.href && element.kind === 'link') {
    locators.push(page.locator(`a[href="${escapeCssValue(element.href)}"]`).first())
  }

  if (element.label) {
    locators.push(page.getByLabel(element.label, { exact: false }).first())
  }
  if (element.placeholder) {
    locators.push(page.getByPlaceholder(element.placeholder, { exact: false }).first())
  }

  const roleName = textLabel ?? action.value ?? undefined
  if (roleName && (element.kind === 'button' || element.role === 'button')) {
    locators.push(page.getByRole('button', { name: roleName, exact: false }).first())
  }
  if (roleName && (element.kind === 'link' || element.role === 'link')) {
    locators.push(page.getByRole('link', { name: roleName, exact: false }).first())
  }
  if (roleName && (element.kind === 'input' || element.kind === 'textarea' || element.kind === 'select')) {
    locators.push(page.getByRole('textbox', { name: roleName, exact: false }).first())
  }
  if (textLabel && (element.kind === 'button' || element.kind === 'link' || element.kind === 'actionable')) {
    locators.push(page.getByText(textLabel, { exact: false }).first())
  }

  return locators
}

type ResolvedTargetElement =
  | CompactPageSnapshot['elements'][number]
  | CompactPageSnapshot['forms'][number]['fields'][number]

function resolveTarget(action: Action, snapshot?: CompactPageSnapshot, fallbackSelector?: string | null) {
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

  return { selector, label, element: fromRef }
}

async function extractText(
  page: Page,
  selector: string | null | undefined,
  context?: TaskContext,
  elementRef?: string | null
) {
  const snapshot = context?.snapshot
  const pageUrl = safeUrl(page.url())
  const contextUrl = safeUrl(context?.url)
  const preferObservedContext = shouldPreferObservedContext(pageUrl, contextUrl)

  if (preferObservedContext) {
    const observedText = extractFromObservedContext(selector, context, elementRef)
    if (observedText) {
      return observedText
    }
  }

  if (selector === 'title') {
    const title = (await page.title()).trim()
    if (title) return normalizeText(title)
  }

  const candidates = (selector ?? 'main, article, [role="main"], body')
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)

  for (const candidate of candidates) {
    const text = await extractWithFallbackLocator(page, candidate)
    if (text) return text
  }

  const observedFallback = extractFromObservedContext(selector, context, elementRef)
  if (observedFallback) {
    return observedFallback
  }

  const bodyText = await page.evaluate(() =>
    document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 4000) ?? ''
  )

  if (bodyText) {
    return normalizeText(bodyText)
  }

  // Last resort: use ANY context text the extension collected, ignoring URL matching.
  // This handles the case where observation exists but extractFromObservedContext
  // returned nothing because the URL selector didn't match main/article/body.
  const anyContextText =
    context?.text?.trim() ||
    context?.textBlocks?.join(' ')?.trim() ||
    context?.snapshot?.visibleTextSummary?.trim() ||
    (context?.headings?.length ? context.headings.join('. ') : '') ||
    context?.title?.trim()

  if (anyContextText) {
    return normalizeText(anyContextText)
  }

  throw new Error(`Could not extract readable text from ${selector ?? 'the current page'}`)
}

async function extractWithFallbackLocator(page: Page, selector: string) {
  try {
    const text = await page.locator(selector).evaluateAll((nodes) => {
      const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 4000)
      const isVisible = (node: Element) => {
        const element = node as HTMLElement
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      }

      const preferred =
        nodes.find((node) => isVisible(node) && normalize((node as HTMLElement).innerText || node.textContent || '').length > 0)
        ?? nodes.find((node) => normalize((node as HTMLElement).innerText || node.textContent || '').length > 0)

      if (!preferred) return ''

      return normalize((preferred as HTMLElement).innerText || preferred.textContent || '')
    })

    return text ? normalizeText(text) : ''
  } catch {
    return ''
  }
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 4000)
}

function extractFromObservedContext(selector: string | null | undefined, context?: TaskContext, elementRef?: string | null) {
  const snapshot = context?.snapshot
  const normalizedSelector = (selector ?? '').trim().toLowerCase()

  if (elementRef && snapshot) {
    const snapshotElement =
      snapshot.elements.find((element) => element.ref === elementRef)
      ?? snapshot.forms.flatMap((form) => form.fields).find((field) => field.ref === elementRef)

    const snapshotText =
      'text' in (snapshotElement ?? {}) ? (snapshotElement as { text?: string }).text : undefined

    if (snapshotText?.trim()) {
      return normalizeText(snapshotText)
    }
  }

  if (normalizedSelector === 'title' && context?.title?.trim()) {
    return normalizeText(context.title)
  }

  if ((normalizedSelector === 'h1' || normalizedSelector.includes('h1')) && context?.headings?.[0]) {
    return normalizeText(context.headings[0])
  }

  if (snapshot?.mainContentRef) {
    const mainElement = snapshot.elements.find((element) => element.ref === snapshot.mainContentRef)
    if (mainElement?.text?.trim() && isReadableSelector(normalizedSelector)) {
      return normalizeText(mainElement.text)
    }
  }

  if (snapshot?.visibleTextSummary?.trim() && isReadableSelector(normalizedSelector)) {
    return normalizeText(snapshot.visibleTextSummary)
  }

  if (context?.textBlocks?.length && isReadableSelector(normalizedSelector)) {
    return normalizeText(context.textBlocks.join(' '))
  }

  if (context?.text?.trim() && isReadableSelector(normalizedSelector)) {
    return normalizeText(context.text)
  }

  return ''
}

function isReadableSelector(selector: string) {
  return (
    !selector ||
    selector === 'body' ||
    selector.includes('main') ||
    selector.includes('article') ||
    selector.includes('[role="main"]') ||
    selector.includes('[role=main]')
  )
}

function shouldPreferObservedContext(pageUrl: URL | null, contextUrl: URL | null) {
  // If the runner's Playwright browser is on a blank or restricted page (about:blank,
  // chrome://newtab, etc.) we can't extract anything useful from it — always fall back
  // to whatever observation context the extension collected from the user's browser.
  if (!pageUrl) return true
  const nonPageProtocols = new Set(['about:', 'chrome:', 'edge:', 'brave:', 'chrome-extension:'])
  if (nonPageProtocols.has(pageUrl.protocol)) return true

  // Page is a real URL.  If we have no context URL to compare against, trust Playwright.
  if (!contextUrl) return false

  // Different pages: prefer the observation the extension already has.
  return pageUrl.href !== contextUrl.href
}

function safeUrl(value?: string) {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function kindToCssTag(kind: ResolvedTargetElement['kind']) {
  switch (kind) {
    case 'input':
      return 'input'
    case 'textarea':
      return 'textarea'
    case 'select':
      return 'select'
    case 'button':
      return 'button'
    case 'link':
      return 'a'
    default:
      return ''
  }
}

function escapeCssValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value?.trim())
}
