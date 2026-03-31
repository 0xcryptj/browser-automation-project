import type { Browser, BrowserContext, Page } from 'playwright'
import { chromium } from 'playwright'
import type { TaskPlan, TaskResult, ActionStep } from '@browser-automation/shared'
import { runAction } from './actions/index.js'
import { observe } from './observer.js'

let browser: Browser | null = null
let context: BrowserContext | null = null

export async function getBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: false, slowMo: 80 })
  }
  if (!context) {
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    })
  }
  const pages = context.pages()
  const page = pages.length > 0 ? pages[pages.length - 1] : await context.newPage()
  return { browser, context, page }
}

export async function closeBrowser(): Promise<void> {
  await context?.close()
  await browser?.close()
  context = null
  browser = null
}

/**
 * Observe → Plan (already done) → Execute → Verify → Recover
 */
export async function execute(plan: TaskPlan): Promise<TaskResult> {
  const startTime = Date.now()
  const { page } = await getBrowser()
  const updatedSteps: ActionStep[] = [...plan.steps]

  // If a step needs approval, stop before executing it and return awaiting_approval
  const approvalIndex = updatedSteps.findIndex(
    (s) => s.action.requiresApproval && s.status === 'pending'
  )
  if (approvalIndex !== -1) {
    const blockedPlan: TaskPlan = {
      ...plan,
      steps: updatedSteps,
      status: 'awaiting_approval',
    }
    return {
      taskId: plan.id,
      plan: blockedPlan,
      durationMs: Date.now() - startTime,
    }
  }

  for (let i = 0; i < updatedSteps.length; i++) {
    const step = updatedSteps[i]

    if (step.status !== 'pending') continue

    updatedSteps[i] = { ...step, status: 'running' }

    const result = await runAction(page, step.action)

    if (result.success) {
      updatedSteps[i] = {
        ...step,
        status: 'done',
        result: result.value,
        screenshot: result.screenshot,
      }
    } else {
      // ── Recover: log and continue (don't abort the whole plan) ──────────
      updatedSteps[i] = {
        ...step,
        status: 'failed',
        error: result.error,
      }
      console.warn(`[executor] Step ${i} failed: ${result.error}`)
      // Only abort if it's a navigation step — others can be non-fatal
      if (step.action.type === 'goto') break
    }
  }

  // ── Verify: observe final state ────────────────────────────────────────
  let finalObservation
  try {
    finalObservation = await observe(page, false)
  } catch {
    // page may have closed
  }

  const anyFailed = updatedSteps.some((s) => s.status === 'failed')
  const allDone = updatedSteps.every((s) => s.status === 'done' || s.status === 'skipped')

  return {
    taskId: plan.id,
    plan: {
      ...plan,
      steps: updatedSteps,
      status: allDone ? 'done' : anyFailed ? 'failed' : 'done',
    },
    observation: finalObservation,
    durationMs: Date.now() - startTime,
  }
}
