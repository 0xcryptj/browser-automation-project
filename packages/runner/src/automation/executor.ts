import type { TaskPlan, TaskResult, ActionStep, TaskContext } from '@browser-automation/shared'
import { runAction } from './actions/index.js'
import { observe } from './observer.js'
import { taskBus } from '../events/taskBus.js'
import { ensureBrowserSession } from './browserManager.js'

/** Track cancelled tasks to stop mid-execution */
const cancelledTasks = new Set<string>()

// Listen for cancellation events on the global channel so we can abort mid-execution.
// We use the raw EventEmitter `on` here because we need to listen across all taskIds,
// not subscribe to a single task channel.
taskBus.on('all', (event: unknown) => {
  if (
    event !== null &&
    typeof event === 'object' &&
    'type' in event &&
    'taskId' in event &&
    (event as { type: string }).type === 'task_cancelled' &&
    typeof (event as { taskId: unknown }).taskId === 'string'
  ) {
    cancelledTasks.add((event as { taskId: string }).taskId)
  }
})

export async function execute(plan: TaskPlan): Promise<TaskResult> {
  const startTime = Date.now()

  // Check if the task was cancelled while waiting in the execution queue
  // before we erase the signal and start running.
  if (cancelledTasks.has(plan.id)) {
    cancelledTasks.delete(plan.id)
    console.info(`[task:${plan.id}] cancelled before execution started`)
    taskBus.publish({
      type: 'task_cancelled',
      taskId: plan.id,
      reason: 'Task cancelled by user',
      durationMs: 0,
    })
    return {
      taskId: plan.id,
      plan: { ...plan, status: 'cancelled' },
      durationMs: 0,
    }
  }

  cancelledTasks.delete(plan.id) // clear any stale signal from a previous run
  console.info(`[task:${plan.id}] started prompt=${JSON.stringify(plan.prompt.slice(0, 120))}`)

  taskBus.publish({ type: 'task_started', taskId: plan.id, prompt: plan.prompt })
  taskBus.publish({
    type: 'plan_created',
    taskId: plan.id,
    stepCount: plan.steps.length,
    summary: plan.summary,
    plannerUsed: plan.plannerUsed,
  })

  // Pre-execution approval gate
  const firstApprovalIndex = plan.steps.findIndex(
    (s) => s.action.requiresApproval && s.status === 'pending'
  )
  if (firstApprovalIndex !== -1) {
    taskBus.publish({
      type: 'approval_required',
      taskId: plan.id,
      stepIndex: firstApprovalIndex,
      action: plan.steps[firstApprovalIndex].action,
      pageUrl: plan.context?.url,
    })
    return {
      taskId: plan.id,
      plan: { ...plan, status: 'awaiting_approval' },
      durationMs: Date.now() - startTime,
    }
  }

  let workingContext = cloneTaskContext(plan.context)
  const interactive = hasInteractiveSteps(plan)
  const contextOnly = canRunFromContextOnly(plan)
  const updatedSteps: ActionStep[] = plan.steps.map((s) => ({ ...s }))

  // For extract-only tasks with existing context, skip browser launch entirely.
  // This avoids opening a separate Chromium window when the extension already
  // collected the page content from the user's browser.
  if (contextOnly && workingContext) {
    return executeFromContext(plan, updatedSteps, workingContext, startTime)
  }

  const { page, isolatedWorkspace } = await ensureBrowserSession(workingContext, {
    interactive,
    preferVisible: interactive,
  })

  if (interactive && isolatedWorkspace) {
    workingContext = await bootstrapAutomationWorkspace(page, workingContext, plan.id, updatedSteps)
  }

  for (let i = 0; i < updatedSteps.length; i++) {
    // Check for cancellation before each step
    if (cancelledTasks.has(plan.id)) {
      break
    }

    const step = updatedSteps[i]
    if (step.status !== 'pending') continue

    if (interactive) {
      await page.bringToFront().catch(() => {})
    }

    // Mid-execution approval gate
    if (step.action.requiresApproval) {
      updatedSteps[i] = { ...step, status: 'awaiting_approval' }
      taskBus.publish({
        type: 'approval_required',
        taskId: plan.id,
        stepIndex: i,
        action: step.action,
        pageUrl: safeUrl(page.url()) || workingContext?.url,
      })
      return {
        taskId: plan.id,
        plan: { ...plan, steps: updatedSteps, status: 'awaiting_approval', context: workingContext },
        durationMs: Date.now() - startTime,
      }
    }

    const stepStart = Date.now()
    updatedSteps[i] = { ...step, status: 'running' }
    taskBus.publish({
      type: 'step_started',
      taskId: plan.id,
      stepIndex: i,
      actionType: step.action.type,
      description: step.action.description,
      selector: step.action.selector ?? undefined,
      elementRef: step.action.elementRef ?? undefined,
      targetLabel: resolveTargetLabel(workingContext, step),
      pageUrl: safeUrl(page.url()) || workingContext?.url,
    })

    const result = await runAction(page, step.action, workingContext)
    const stepDuration = Date.now() - stepStart

    if (result.success) {
      updatedSteps[i] = {
        ...step,
        status: 'done',
        result: result.value,
        screenshot: result.screenshot,
        durationMs: stepDuration,
      }
      taskBus.publish({
        type: 'step_succeeded',
        taskId: plan.id,
        stepIndex: i,
        result: result.value,
        hasScreenshot: Boolean(result.screenshot),
        durationMs: stepDuration,
      })

      if (shouldRefreshContext(step)) {
        workingContext = await refreshTaskContext(page, workingContext, plan.id, step.action.type)
      }
    } else {
      updatedSteps[i] = {
        ...step,
        status: 'failed',
        error: result.error,
        durationMs: stepDuration,
        screenshot: result.screenshot,
      }
      taskBus.publish({
        type: 'step_failed',
        taskId: plan.id,
        stepIndex: i,
        error: result.error ?? 'Unknown error',
        retrying: false,
        hasScreenshot: Boolean(result.screenshot),
        pageUrl: safeUrl(page.url()) || workingContext?.url,
      })
      console.warn(`[executor] Step ${i} (${step.action.type}) failed: ${result.error}`)
      // Navigation failures are fatal for this execution — all subsequent steps assume the page loaded
      if (step.action.type === 'goto') break
    }
  }

  // Verify: observe final page state (best-effort, non-fatal)
  let finalObservation
  try {
    finalObservation = await observe(page, false)
  } catch {
    // Page may have closed or navigated away — acceptable
  }

  const cancelled = cancelledTasks.has(plan.id)
  const anyFailed = updatedSteps.some((s) => s.status === 'failed')
  const durationMs = Date.now() - startTime
  const stepsDone = updatedSteps.filter((s) => s.status === 'done').length
  const stepsFailed = updatedSteps.filter((s) => s.status === 'failed').length

  if (cancelled) {
    console.info(`[task:${plan.id}] cancelled durationMs=${durationMs}`)
    taskBus.publish({
      type: 'task_cancelled',
      taskId: plan.id,
      reason: 'Task cancelled by user',
      durationMs,
    })
  } else if (anyFailed) {
    console.info(
      `[task:${plan.id}] failed durationMs=${durationMs} stepsDone=${stepsDone} stepsFailed=${stepsFailed}`
    )
    taskBus.publish({
      type: 'task_failed',
      taskId: plan.id,
      error:
        updatedSteps.find((s) => s.status === 'failed')?.error ??
        'Task failed during execution',
      durationMs,
      stepsDone,
      stepsFailed,
    })
  } else {
    console.info(
      `[task:${plan.id}] completed durationMs=${durationMs} stepsDone=${stepsDone} stepsFailed=${stepsFailed}`
    )
    taskBus.publish({
      type: 'task_completed',
      taskId: plan.id,
      status: 'done',
      durationMs,
      stepsDone,
      stepsFailed,
    })
  }

  cancelledTasks.delete(plan.id)
  const finalStatus = cancelled ? 'cancelled' : anyFailed ? 'failed' : 'done'

  return {
    taskId: plan.id,
    plan: { ...plan, steps: updatedSteps, status: finalStatus, context: workingContext },
    observation: finalObservation,
    durationMs,
  }
}

function cloneTaskContext(context: TaskContext | undefined): TaskContext | undefined {
  return context ? (JSON.parse(JSON.stringify(context)) as TaskContext) : undefined
}

function hasInteractiveSteps(plan: TaskPlan) {
  return plan.steps.some((step) =>
    ['goto', 'click', 'type', 'select', 'scroll', 'hover', 'press', 'pressKey', 'wait_for_selector', 'wait_for_text'].includes(
      step.action.type
    )
  )
}

function shouldRefreshContext(step: ActionStep) {
  return ['goto', 'click', 'type', 'select', 'press', 'pressKey', 'scroll'].includes(step.action.type)
}

async function bootstrapAutomationWorkspace(
  page: Parameters<typeof observe>[0],
  current: TaskContext | undefined,
  taskId: string,
  steps: ActionStep[]
) {
  const targetUrl = current?.url
  const firstStep = steps.find((step) => step.status === 'pending')

  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return current
  }

  if (firstStep?.action.type === 'goto') {
    return current
  }

  const currentUrl = safeUrl(page.url())
  if (currentUrl === normalizeUrl(targetUrl)) {
    return current
  }

  console.info(`[task:${taskId}] opening isolated automation workspace at ${targetUrl}`)
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(250)
  return refreshTaskContext(page, current, taskId, 'bootstrap_workspace')
}

async function refreshTaskContext(
  page: Parameters<typeof observe>[0],
  current: TaskContext | undefined,
  taskId: string,
  actionType: string
) {
  try {
    const observation = await observe(page, false)
    const nextContext: TaskContext = {
      url: observation.url,
      title: observation.title,
      snapshot: observation.snapshot,
      text: observation.text,
      headings: observation.headings,
      textBlocks: observation.textBlocks?.map((block) => block.text),
    }
    console.info(`[task:${taskId}] refreshed page context after ${actionType}${nextContext.url ? ` url=${nextContext.url}` : ''}`)
    return nextContext
  } catch (error) {
    console.warn(
      `[task:${taskId}] could not refresh page context after ${actionType}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return current
  }
}

function resolveTargetLabel(context: TaskContext | undefined, step: ActionStep) {
  if (!context?.snapshot || !step.action.elementRef) {
    return step.action.selector ?? step.action.elementRef ?? step.action.value ?? undefined
  }

  const matchedElement =
    context.snapshot.elements.find((element) => element.ref === step.action.elementRef) ??
    context.snapshot.forms.flatMap((form) => form.fields).find((field) => field.ref === step.action.elementRef)

  if (!matchedElement) {
    return step.action.selector ?? step.action.elementRef ?? step.action.value ?? undefined
  }

  return (
    matchedElement.label ??
    matchedElement.name ??
    ('text' in matchedElement ? matchedElement.text : undefined) ??
    matchedElement.selector ??
    step.action.elementRef
  )
}

function canRunFromContextOnly(plan: TaskPlan) {
  const contextOnlyActions = new Set(['extract', 'screenshot'])
  return (
    plan.steps.length > 0 &&
    plan.steps.every((step) => contextOnlyActions.has(step.action.type)) &&
    plan.context != null
  )
}

async function executeFromContext(
  plan: TaskPlan,
  updatedSteps: ActionStep[],
  workingContext: TaskContext,
  startTime: number
): Promise<TaskResult> {
  console.info(`[task:${plan.id}] running from observed context (no browser needed)`)

  for (let i = 0; i < updatedSteps.length; i++) {
    if (cancelledTasks.has(plan.id)) break
    const step = updatedSteps[i]
    if (step.status !== 'pending') continue

    const stepStart = Date.now()
    updatedSteps[i] = { ...step, status: 'running' }
    taskBus.publish({
      type: 'step_started',
      taskId: plan.id,
      stepIndex: i,
      actionType: step.action.type,
      description: step.action.description,
      pageUrl: workingContext.url,
    })

    if (step.action.type === 'extract') {
      const text =
        workingContext.text?.trim() ||
        workingContext.textBlocks?.join(' ')?.trim() ||
        workingContext.snapshot?.visibleTextSummary?.trim() ||
        (workingContext.headings?.length ? workingContext.headings.join('. ') : '') ||
        workingContext.title?.trim() ||
        ''

      if (text) {
        const normalized = text.replace(/\s+/g, ' ').trim().slice(0, 4000)
        updatedSteps[i] = { ...step, status: 'done', result: normalized, durationMs: Date.now() - stepStart }
        taskBus.publish({ type: 'step_succeeded', taskId: plan.id, stepIndex: i, result: normalized, hasScreenshot: false, durationMs: Date.now() - stepStart })
      } else {
        updatedSteps[i] = { ...step, status: 'failed', error: 'No readable content available from the page context.', durationMs: Date.now() - stepStart }
        taskBus.publish({ type: 'step_failed', taskId: plan.id, stepIndex: i, error: 'No readable content available from the page context.', retrying: false, hasScreenshot: false, pageUrl: workingContext.url })
      }
    } else {
      updatedSteps[i] = { ...step, status: 'done', result: 'Context-only mode', durationMs: Date.now() - stepStart }
      taskBus.publish({ type: 'step_succeeded', taskId: plan.id, stepIndex: i, result: 'Context-only mode', hasScreenshot: false, durationMs: Date.now() - stepStart })
    }
  }

  const cancelled = cancelledTasks.has(plan.id)
  const anyFailed = updatedSteps.some((s) => s.status === 'failed')
  const durationMs = Date.now() - startTime
  const stepsDone = updatedSteps.filter((s) => s.status === 'done').length
  const stepsFailed = updatedSteps.filter((s) => s.status === 'failed').length
  const finalStatus = cancelled ? 'cancelled' : anyFailed ? 'failed' : 'done'

  if (cancelled) {
    taskBus.publish({ type: 'task_cancelled', taskId: plan.id, reason: 'Task cancelled by user', durationMs })
  } else if (anyFailed) {
    taskBus.publish({ type: 'task_failed', taskId: plan.id, error: updatedSteps.find((s) => s.status === 'failed')?.error ?? 'Task failed', durationMs, stepsDone, stepsFailed })
  } else {
    taskBus.publish({ type: 'task_completed', taskId: plan.id, status: 'done', durationMs, stepsDone, stepsFailed })
  }

  cancelledTasks.delete(plan.id)
  return { taskId: plan.id, plan: { ...plan, steps: updatedSteps, status: finalStatus, context: workingContext }, durationMs }
}

function normalizeUrl(url?: string | null) {
  return url?.trim().replace(/\/$/, '').toLowerCase() || ''
}

function safeUrl(value?: string | null) {
  try {
    return value ? normalizeUrl(new URL(value).toString()) : ''
  } catch {
    return normalizeUrl(value)
  }
}
