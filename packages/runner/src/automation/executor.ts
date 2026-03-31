import type { Browser, BrowserContext, Page } from 'playwright'
import { chromium } from 'playwright'
import type { TaskPlan, TaskResult, ActionStep } from '@browser-automation/shared'
import { runAction } from './actions/index.js'
import { observe } from './observer.js'
import { taskBus } from '../events/taskBus.js'

let browser: Browser | null = null
let context: BrowserContext | null = null

export async function getBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: false, slowMo: 60 })
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

export async function execute(plan: TaskPlan): Promise<TaskResult> {
  const startTime = Date.now()

  taskBus.publish({ type: 'task_started', taskId: plan.id, prompt: plan.prompt })
  taskBus.publish({
    type: 'plan_created',
    taskId: plan.id,
    stepCount: plan.steps.length,
    summary: plan.summary,
  })

  // If any step needs approval before we even start, pause and return
  const firstApprovalIndex = plan.steps.findIndex(
    (s) => s.action.requiresApproval && s.status === 'pending'
  )
  if (firstApprovalIndex !== -1) {
    taskBus.publish({
      type: 'approval_required',
      taskId: plan.id,
      stepIndex: firstApprovalIndex,
      action: plan.steps[firstApprovalIndex].action,
    })
    return {
      taskId: plan.id,
      plan: { ...plan, status: 'awaiting_approval' },
      durationMs: Date.now() - startTime,
    }
  }

  const { page } = await getBrowser()
  const updatedSteps: ActionStep[] = plan.steps.map((s) => ({ ...s }))

  for (let i = 0; i < updatedSteps.length; i++) {
    const step = updatedSteps[i]
    if (step.status !== 'pending') continue

    // Approval gate mid-execution
    if (step.action.requiresApproval) {
      updatedSteps[i] = { ...step, status: 'awaiting_approval' }
      taskBus.publish({
        type: 'approval_required',
        taskId: plan.id,
        stepIndex: i,
        action: step.action,
      })
      return {
        taskId: plan.id,
        plan: { ...plan, steps: updatedSteps, status: 'awaiting_approval' },
        durationMs: Date.now() - startTime,
      }
    }

    updatedSteps[i] = { ...step, status: 'running' }
    taskBus.publish({
      type: 'step_started',
      taskId: plan.id,
      stepIndex: i,
      actionType: step.action.type,
      description: step.action.description,
    })

    const result = await runAction(page, step.action)

    if (result.success) {
      updatedSteps[i] = {
        ...step,
        status: 'done',
        result: result.value,
        screenshot: result.screenshot,
      }
      taskBus.publish({
        type: 'step_succeeded',
        taskId: plan.id,
        stepIndex: i,
        result: result.value,
        hasScreenshot: Boolean(result.screenshot),
      })
    } else {
      updatedSteps[i] = { ...step, status: 'failed', error: result.error }
      taskBus.publish({
        type: 'step_failed',
        taskId: plan.id,
        stepIndex: i,
        error: result.error ?? 'Unknown error',
      })
      console.warn(`[executor] Step ${i} failed: ${result.error}`)
      if (step.action.type === 'goto') break // navigation failures are fatal
    }
  }

  // Verify: observe final page state
  let finalObservation
  try {
    finalObservation = await observe(page, false)
  } catch {
    // page may have closed; non-fatal
  }

  const anyFailed = updatedSteps.some((s) => s.status === 'failed')
  const finalStatus = anyFailed ? 'failed' : 'done'
  const durationMs = Date.now() - startTime

  taskBus.publish({ type: 'task_completed', taskId: plan.id, status: finalStatus, durationMs })

  return {
    taskId: plan.id,
    plan: { ...plan, steps: updatedSteps, status: finalStatus },
    observation: finalObservation,
    durationMs,
  }
}
