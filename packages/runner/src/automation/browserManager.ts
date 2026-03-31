import type { Browser, BrowserContext, Page } from 'playwright'
import { chromium } from 'playwright'
import { config } from '../config.js'

type BrowserState = {
  browserConnected: boolean
  contextOpen: boolean
  pageOpen: boolean
  pageCount: number
  activePageUrl: string | null
}

let browser: Browser | null = null
let context: BrowserContext | null = null
let activePage: Page | null = null
let hooksRegistered = false

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
  })
}

function attachContext(contextInstance: BrowserContext) {
  contextInstance.on('close', () => {
    log('context closed')
    if (context === contextInstance) {
      context = null
    }
    activePage = null
  })
}

function attachPage(pageInstance: Page) {
  pageInstance.on('close', () => {
    log('page closed')
    if (activePage === pageInstance) {
      activePage = null
    }
  })
  pageInstance.on('crash', () => {
    log('page crashed')
    if (activePage === pageInstance) {
      activePage = null
    }
  })
}

async function createBrowser() {
  browser = await chromium.launch({
    headless: config.HEADLESS,
    slowMo: config.SLOW_MO,
  })
  attachBrowser(browser)
  log(`launched (headless=${String(config.HEADLESS)}, slowMo=${String(config.SLOW_MO)})`)
}

async function createContext() {
  if (!browser) {
    throw new Error('Cannot create browser context before launching the browser.')
  }

  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  })
  activePage = null
  attachContext(context)
  log('context created')
}

async function createPage() {
  if (!context) {
    throw new Error('Cannot create page before creating a browser context.')
  }

  activePage = await context.newPage()
  attachPage(activePage)
  log('page created')
}

export async function ensureBrowserSession(): Promise<{
  browser: Browser
  context: BrowserContext
  page: Page
}> {
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
    await createContext()
  }

  if (!context) {
    throw new Error('Browser context was not available after initialization.')
  }

  if (!canUsePage(activePage)) {
    const existingPages = context.pages().filter((page) => canUsePage(page))
    if (existingPages.length > 0) {
      activePage = existingPages[existingPages.length - 1]
      log('reusing existing page')
    } else {
      log('creating fresh page')
      await createPage()
    }
  }

  if (!browser || !context || !activePage) {
    throw new Error('Browser session was not available after initialization.')
  }

  return {
    browser,
    context,
    page: activePage,
  }
}

export function getBrowserState(): BrowserState {
  const browserConnected = Boolean(browser?.isConnected())
  const contextOpen = canUseContext(context)
  const pageOpen = canUsePage(activePage)
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

  return {
    browserConnected,
    contextOpen,
    pageOpen,
    pageCount,
    activePageUrl,
  }
}

export async function disposeBrowserSession() {
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

  if (browser?.isConnected()) {
    log('closing browser')
    await browser.close().catch(() => {})
  }
  browser = null
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
