import type { TaskPlan, TaskResult, ActionStep, TaskContext } from '@browser-automation/shared'
import { runAction } from './actions/index.js'
import { observe } from './observer.js'
import { taskBus } from '../events/taskBus.js'
import { ensureBrowserSession } from './browserManager.js'

/** Track cancelled tasks to stop mid-execution */
const cancelledTasks = new Set<string>()
taskBus.on('all', (event: { type: string; taskId: string }) => {
  if (event.type === 'task_cancelled') cancelledTasks.add(event.taskId)
})

export async function execute(plan: TaskPlan): Promise<TaskResult> {
  const startTime = Date.now()
  cancelledTasks.delete(plan.id) // reset on fresh execution
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
  const { page, isolatedWorkspace } = await ensureBrowserSession(workingContext, {
    interactive,
    preferVisible: interactive,
  })
  const updatedSteps: ActionStep[] = plan.steps.map((s) => ({ ...s }))

  if (interactive && isolatedWorkspace) {
    workingContext = await bootstrapAutomationWorkspace(page, workingContext, plan.id, updatedSteps)
  }

  for (let i = 0; i < updatedSteps.length; i++) {
    // Check for cancellation
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
      console.warn(`[executor] Step ${i} failed: ${result.error}`)
      // Navigation failures are fatal; others continue
      if (step.action.type === 'goto') break
    }
  }

  // Verify: observe final page state
  let finalObservation
  try {
    finalObservation = await observe(page, false)
  } catch {
    // page may have closed; non-fatal
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
  return context ? JSON.parse(JSON.stringify(context)) as TaskContext : undefined
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
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
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
