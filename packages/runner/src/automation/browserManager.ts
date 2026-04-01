import type { Browser, BrowserContext, Page } from 'playwright'
import { chromium } from 'playwright'
import { config } from '../config.js'
import type { TaskContext } from '@browser-automation/shared'
import { getResolvedBrowserConfig } from '../settings/browserConfigStore.js'

type BrowserState = {
  browserConnected: boolean
  contextOpen: boolean
  pageOpen: boolean
  pageCount: number
  activePageUrl: string | null
  automationContextOpen: boolean
  automationPageOpen: boolean
  automationPageUrl: string | null
}

let browser: Browser | null = null
let context: BrowserContext | null = null
let activePage: Page | null = null
let automationContext: BrowserContext | null = null
let automationPage: Page | null = null
let hooksRegistered = false
let activeBrowserConfigKey: string | null = null

function log(message: string) {
  console.log(`[browser] ${message}`)
}

function canUseContext(candidate: BrowserContext | null): candidate is BrowserContext {
  if (!candidate || !browser?.isConnected()) return false
  try {
    candidate.pages()
    return true
  } catch {
    return false
  }
}

function canUsePage(candidate: Page | null): candidate is Page {
  if (!candidate) return false
  try {
    return !candidate.isClosed()
  } catch {
    return false
  }
}

function attachBrowser(browserInstance: Browser) {
  browserInstance.on('disconnected', () => {
    log('browser disconnected')
    browser = null
    context = null
    activePage = null
    automationContext = null
    automationPage = null
  })
}

function attachContext(contextInstance: BrowserContext, role: 'default' | 'automation') {
  contextInstance.on('close', () => {
    log(`${role} context closed`)
    if (role === 'default' && context === contextInstance) {
      context = null
      activePage = null
    }
    if (role === 'automation' && automationContext === contextInstance) {
      automationContext = null
      automationPage = null
    }
  })
}

function attachPage(pageInstance: Page, role: 'default' | 'automation') {
  pageInstance.on('close', () => {
    log(`${role} page closed`)
    if (role === 'default' && activePage === pageInstance) {
      activePage = null
    }
    if (role === 'automation' && automationPage === pageInstance) {
      automationPage = null
    }
  })
  pageInstance.on('crash', () => {
    log(`${role} page crashed`)
    if (role === 'default' && activePage === pageInstance) {
      activePage = null
    }
    if (role === 'automation' && automationPage === pageInstance) {
      automationPage = null
    }
  })
}

async function createBrowser() {
  const browserTarget = await getResolvedBrowserConfig()

  if (browserTarget.mode === 'attach') {
    if (!browserTarget.ready) {
      throw new Error(
        browserTarget.warning ??
          `Browser attach mode is not reachable at ${browserTarget.cdpUrl ?? 'the configured CDP URL'}.`
      )
    }
    browser = await chromium.connectOverCDP(browserTarget.cdpUrl!)
    attachBrowser(browser)
    activeBrowserConfigKey = serializeBrowserTarget(browserTarget)
    log(`attached via cdp ${browserTarget.cdpUrl}`)
    return
  }

  browser = await chromium.launch({
    headless: config.HEADLESS,
    slowMo: config.SLOW_MO,
  })
  attachBrowser(browser)
  activeBrowserConfigKey = serializeBrowserTarget(browserTarget)
  log(`launched (headless=${String(config.HEADLESS)}, slowMo=${String(config.SLOW_MO)})`)
}

async function createContext(preferred?: Pick<TaskContext, 'url' | 'title'>) {
  if (!browser) {
    throw new Error('Cannot create browser context before launching the browser.')
  }

  const browserTarget = await getResolvedBrowserConfig()
  if (browserTarget.mode === 'attach') {
    const existingContexts = browser.contexts()
    context = existingContexts[0] ?? null
    if (!context) {
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      })
      log('context created on attached browser')
    } else {
      log('using attached browser context')
    }
    activePage = null
    attachContext(context, 'default')
    await selectBestPage(preferred)
    return
  }

  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  })
  activePage = null
  attachContext(context, 'default')
  log('context created')
}

async function createPage(role: 'default' | 'automation' = 'default') {
  const targetContext = role === 'automation' ? automationContext : context
  if (!targetContext) {
    throw new Error('Cannot create page before creating a browser context.')
  }

  const page = await targetContext.newPage()
  attachPage(page, role)

  if (role === 'automation') {
    automationPage = page
    log('automation workspace page created')
  } else {
    activePage = page
    log('page created')
  }
}

async function ensureAutomationWorkspace(preferred?: Pick<TaskContext, 'url' | 'title'>) {
  if (!browser) {
    throw new Error('Cannot create automation workspace before launching the browser.')
  }

  const browserTarget = await getResolvedBrowserConfig()

  if (browserTarget.mode === 'attach') {
    if (!canUseContext(context)) {
      await createContext(preferred)
    }

    automationContext = context
    if (!automationContext) {
      throw new Error('Attached browser context was not available for automation.')
    }

    log('automation workspace reusing attached browser window')
  }

  if (!canUseContext(automationContext)) {
    automationContext = null
    automationPage = null

    try {
      automationContext = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      })
      attachContext(automationContext, 'automation')
      log('automation workspace context created')
    } catch (error) {
      log(
        `automation workspace context fallback: ${
          error instanceof Error ? error.message : String(error)
        }`
      )

      if (!canUseContext(context)) {
        await createContext(preferred)
      }

      automationContext = context
    }
  }

  if (!canUsePage(automationPage)) {
    const workspaceContext = automationContext
    if (!workspaceContext) {
      throw new Error('Automation workspace context was not available after initialization.')
    }
    const existingPages = workspaceContext
      .pages()
      .filter((page) => canUsePage(page) && page !== activePage)
    automationPage = existingPages[existingPages.length - 1] ?? null
  }

  if (!canUsePage(automationPage)) {
    await createPage('automation')
  }

  if (!automationPage) {
    throw new Error('Automation workspace page was not available after initialization.')
  }

  const workspaceContext = automationContext
  const workspacePage = automationPage

  if (!workspaceContext || !workspacePage) {
    throw new Error('Automation workspace session was not available after initialization.')
  }

  return {
    context: workspaceContext,
    page: workspacePage,
  }
}

export async function ensureBrowserSession(
  preferred?: Pick<TaskContext, 'url' | 'title'>,
  options: { interactive?: boolean; preferVisible?: boolean } = {}
): Promise<{
  browser: Browser
  context: BrowserContext
  page: Page
  isolatedWorkspace: boolean
}> {
  const interactive = Boolean(options?.interactive)
  const preferVisible = options?.preferVisible ?? true
  const browserTarget = await getResolvedBrowserConfig()
  const browserConfigKey = serializeBrowserTarget(browserTarget)

  if (activeBrowserConfigKey && activeBrowserConfigKey !== browserConfigKey) {
    log(`browser target changed -> resetting session (${activeBrowserConfigKey} -> ${browserConfigKey})`)
    await disposeBrowserSession()
  }

  if (!browser?.isConnected()) {
    browser = null
    context = null
    activePage = null
    await createBrowser()
  }

  if (!canUseContext(context)) {
    context = null
    activePage = null
    log('recreating browser context')
    await createContext(preferred)
  }

  if (!context) {
    throw new Error('Browser context was not available after initialization.')
  }

  if (!canUsePage(activePage) || (!interactive && shouldSwapToPreferredPage(activePage, preferred))) {
    await selectBestPage(preferred)
  }

  let sessionContext = context
  let sessionPage = activePage
  let isolatedWorkspace = false

  if (browserTarget.mode === 'attach' && interactive) {
    const workspace = await ensureAutomationWorkspace(preferred)
    sessionContext = workspace.context
    sessionPage = workspace.page
    isolatedWorkspace = true
  }

  if (!browser || !sessionContext || !sessionPage) {
    throw new Error('Browser session was not available after initialization.')
  }

  if (preferVisible) {
    await sessionPage.bringToFront().catch(() => {})
  }

  return {
    browser,
    context: sessionContext,
    page: sessionPage,
    isolatedWorkspace,
  }
}

export function getBrowserState(): BrowserState {
  const browserConnected = Boolean(browser?.isConnected())
  const contextOpen = canUseContext(context)
  const pageOpen = canUsePage(activePage)
  const automationContextOpen = canUseContext(automationContext)
  const automationPageOpen = canUsePage(automationPage)
  const currentContext = contextOpen ? context : null
  const currentPage = pageOpen ? activePage : null
  let pageCount = 0

  if (currentContext) {
    try {
      pageCount = currentContext.pages().length
    } catch {
      pageCount = 0
    }
  }

  let activePageUrl: string | null = null
  if (currentPage) {
    try {
      activePageUrl = currentPage.url() || null
    } catch {
      activePageUrl = null
    }
  }

  let automationPageUrl: string | null = null
  if (automationPageOpen) {
    try {
      automationPageUrl = automationPage?.url() || null
    } catch {
      automationPageUrl = null
    }
  }

  return {
    browserConnected,
    contextOpen,
    pageOpen,
    pageCount,
    activePageUrl,
    automationContextOpen,
    automationPageOpen,
    automationPageUrl,
  }
}

export async function disposeBrowserSession() {
  const defaultContextRef = context
  const defaultPageRef = activePage
  const automationContextRef = automationContext
  const automationPageRef = automationPage

  if (activePage && canUsePage(activePage)) {
    log('closing active page')
    await activePage.close().catch(() => {})
  }
  activePage = null

  if (context && canUseContext(context)) {
    log('closing browser context')
    await context.close().catch(() => {})
  }
  context = null

  if (automationPageRef && canUsePage(automationPageRef) && automationPageRef !== defaultPageRef) {
    log('closing automation workspace page')
    await automationPageRef.close().catch(() => {})
  }
  automationPage = null

  if (automationContextRef && canUseContext(automationContextRef) && automationContextRef !== defaultContextRef) {
    log('closing automation workspace context')
    await automationContextRef.close().catch(() => {})
  }
  automationContext = null

  if (browser?.isConnected()) {
    log('closing browser')
    await browser.close().catch(() => {})
  }
  browser = null
  activeBrowserConfigKey = null
}

export function registerBrowserShutdownHooks() {
  if (hooksRegistered) {
    return
  }

  hooksRegistered = true

  const shutdown = (signal: string) => {
    void disposeBrowserSession().finally(() => {
      if (signal !== 'beforeExit') {
        process.exit(0)
      }
    })
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('beforeExit', () => shutdown('beforeExit'))
}

async function selectBestPage(preferred?: Pick<TaskContext, 'url' | 'title'>) {
  if (!context) {
    throw new Error('Cannot select a page without a browser context.')
  }

  const existingPages = context.pages().filter((page) => canUsePage(page))
  const preferredUrl = normalizeUrl(preferred?.url)
  const matchedPage =
    (preferredUrl
      ? existingPages.find((page) => normalizeUrl(safePageUrl(page)) === preferredUrl)
      : undefined) ??
    existingPages[existingPages.length - 1]

  if (matchedPage) {
    activePage = matchedPage
    log(`reusing page ${truncateUrl(safePageUrl(matchedPage)) || 'about:blank'}`)
    return
  }

  log('creating fresh page')
  await createPage()
}

function shouldSwapToPreferredPage(page: Page | null, preferred?: Pick<TaskContext, 'url' | 'title'>) {
  if (!page || !preferred?.url) {
    return !canUsePage(page)
  }

  const currentUrl = normalizeUrl(safePageUrl(page))
  const targetUrl = normalizeUrl(preferred.url)
  return Boolean(targetUrl && currentUrl && currentUrl !== targetUrl)
}

function serializeBrowserTarget(target: Awaited<ReturnType<typeof getResolvedBrowserConfig>>) {
  return JSON.stringify({
    mode: target.mode,
    cdpUrl: target.cdpUrl ?? null,
  })
}

function safePageUrl(page: Page) {
  try {
    return page.url()
  } catch {
    return ''
  }
}

function normalizeUrl(url?: string | null) {
  return url?.trim().replace(/\/$/, '').toLowerCase() || ''
}

function truncateUrl(url: string) {
  return url.length > 90 ? `${url.slice(0, 87)}...` : url
}
