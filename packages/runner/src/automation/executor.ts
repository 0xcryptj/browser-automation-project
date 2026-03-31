import type { TaskPlan, TaskResult, ActionStep } from '@browser-automation/shared'
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
    })
    return {
      taskId: plan.id,
      plan: { ...plan, status: 'awaiting_approval' },
      durationMs: Date.now() - startTime,
    }
  }

  const { page } = await ensureBrowserSession()
  const updatedSteps: ActionStep[] = plan.steps.map((s) => ({ ...s }))

  for (let i = 0; i < updatedSteps.length; i++) {
    // Check for cancellation
    if (cancelledTasks.has(plan.id)) {
      break
    }

    const step = updatedSteps[i]
    if (step.status !== 'pending') continue

    // Mid-execution approval gate
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

    const stepStart = Date.now()
    updatedSteps[i] = { ...step, status: 'running' }
    taskBus.publish({
      type: 'step_started',
      taskId: plan.id,
      stepIndex: i,
      actionType: step.action.type,
      description: step.action.description,
    })

    const result = await runAction(page, step.action, plan.context?.snapshot)
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
    } else {
      updatedSteps[i] = { ...step, status: 'failed', error: result.error, durationMs: stepDuration }
      taskBus.publish({
        type: 'step_failed',
        taskId: plan.id,
        stepIndex: i,
        error: result.error ?? 'Unknown error',
        retrying: false,
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
    plan: { ...plan, steps: updatedSteps, status: finalStatus },
    observation: finalObservation,
    durationMs,
  }
}
