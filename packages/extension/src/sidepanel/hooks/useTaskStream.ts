import { useState, useEffect, useRef, useCallback } from 'react'
import type { PageObservation, TaskEvent } from '@browser-automation/shared'
import { runnerClient } from '../../lib/runnerClient.js'
import { getSettings } from '../../lib/storage.js'

export type LiveStep = {
  index: number
  actionType: string
  description: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'awaiting_approval' | 'skipped'
  result?: string
  error?: string
  hasScreenshot?: boolean
  durationMs?: number
}

export type StreamState = {
  taskId: string | null
  prompt: string
  status: 'idle' | 'submitting' | 'planning' | 'streaming' | 'done' | 'failed' | 'awaiting_approval' | 'error' | 'cancelled'
  steps: LiveStep[]
  stepCount: number
  durationMs: number | null
  error: string | null
  plannerUsed: string | null
  pendingApproval: (TaskEvent & { type: 'approval_required' }) | null
}

const INITIAL: StreamState = {
  taskId: null,
  prompt: '',
  status: 'idle',
  steps: [],
  stepCount: 0,
  durationMs: null,
  error: null,
  plannerUsed: null,
  pendingApproval: null,
}

export function useTaskStream() {
  const [state, setState] = useState<StreamState>(INITIAL)
  const esRef = useRef<EventSource | null>(null)

  const closeStream = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
  }, [])

  const openStream = useCallback(
    async (taskId: string) => {
      closeStream()
      const settings = await getSettings()
      const base = settings.runnerBaseUrl.replace(/\/$/, '')
      const url = `${base}/task/${taskId}/stream`

      const es = new EventSource(url)
      esRef.current = es

      es.onmessage = (e) => {
        let event: TaskEvent
        try { event = JSON.parse(e.data) as TaskEvent } catch { return }
        setState((prev) => applyEvent(prev, event))
        if (event.type === 'task_completed' || event.type === 'task_failed' || event.type === 'task_cancelled') {
          setTimeout(closeStream, 400)
        }
      }

      es.onerror = async () => {
        closeStream()

        try {
          const snapshot = await runnerClient.getTask(taskId)
          setState((prev) => reconcileWithTaskSnapshot(prev, snapshot))
        } catch {
          setState((prev) => {
            if (
              prev.status === 'done' ||
              prev.status === 'failed' ||
              prev.status === 'cancelled' ||
              prev.status === 'awaiting_approval'
            ) {
              return prev
            }

            return {
              ...prev,
              status: 'error',
              error: 'Lost connection to the runner stream. Check the runner and retry.',
            }
          })
        }
      }
    },
    [closeStream]
  )

  const submitTask = useCallback(
    async (prompt: string, observation?: PageObservation | null, mode: 'standard' | 'assist' = 'standard') => {
      closeStream()
      setState({ ...INITIAL, prompt, status: 'submitting' })

      try {
        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

        setState((prev) => ({ ...prev, status: 'planning' }))

        const data = await runnerClient.submitTask({
          id: taskId,
          prompt,
          mode,
          url: observation?.url,
          title: observation?.title,
          observation: observation ?? undefined,
        })

        const id: string = data.taskId ?? taskId

        setState((prev) => ({
          ...prev,
          taskId: id,
          status: 'streaming',
          stepCount: data.plan?.steps?.length ?? 0,
          steps: (data.plan?.steps ?? []).map((s) => ({
            index: s.step,
            actionType: s.action.type,
            description: s.action.description,
            status: s.status as LiveStep['status'],
          })),
        }))

        await openStream(id)
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : 'Runner unreachable. Is it running?',
        }))
      }
    },
    [closeStream, openStream]
  )

  const approve = useCallback(
    async (taskId: string, stepIndex: number, approved: boolean) => {
      setState((prev) => ({ ...prev, pendingApproval: null, status: 'streaming' }))
      closeStream()
      try {
        await runnerClient.approve(taskId, stepIndex, approved)
        await openStream(taskId)
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : 'Approval request failed',
        }))
      }
    },
    [closeStream, openStream]
  )

  const cancel = useCallback(
    async () => {
      if (state.taskId) {
        await runnerClient.cancel(state.taskId).catch(() => {})
      }
      closeStream()
      setState((prev) => ({ ...prev, status: 'cancelled' }))
    },
    [state.taskId, closeStream]
  )

  const reset = useCallback(() => {
    closeStream()
    setState(INITIAL)
  }, [closeStream])

  const retryStream = useCallback(async () => {
    if (!state.taskId) return
    setState((prev) => ({ ...prev, error: null }))
    await openStream(state.taskId)
  }, [openStream, state.taskId])

  useEffect(() => closeStream, [closeStream])

  return { state, submitTask, approve, cancel, reset, retryStream }
}

// ── Pure state reducer ────────────────────────────────────────────────────────

function applyEvent(state: StreamState, event: TaskEvent): StreamState {
  switch (event.type) {
    case 'task_started':
      return { ...state, status: 'streaming', error: null }

    case 'plan_created':
      return {
        ...state,
        stepCount: event.stepCount,
        plannerUsed: event.plannerUsed ?? state.plannerUsed,
      }

    case 'step_started':
      return {
        ...state,
        steps: upsertStep(state.steps, {
          index: event.stepIndex,
          actionType: event.actionType,
          description: event.description,
          status: 'running',
        }),
      }

    case 'step_succeeded':
      return {
        ...state,
        steps: upsertStep(state.steps, {
          index: event.stepIndex,
          status: 'done',
          result: event.result,
          hasScreenshot: event.hasScreenshot,
          durationMs: event.durationMs,
        }),
      }

    case 'step_failed':
      return {
        ...state,
        steps: upsertStep(state.steps, {
          index: event.stepIndex,
          status: 'failed',
          error: event.error,
        }),
      }

    case 'approval_required':
      return {
        ...state,
        status: 'awaiting_approval',
        pendingApproval: event,
        steps: upsertStep(state.steps, {
          index: event.stepIndex,
          status: 'awaiting_approval',
        }),
      }

    case 'task_completed':
      return {
        ...state,
        status: 'done',
        durationMs: event.durationMs,
        error: null,
        pendingApproval: null,
      }

    case 'task_failed':
      return {
        ...state,
        status: 'failed',
        error: event.error,
        durationMs: event.durationMs ?? state.durationMs,
        pendingApproval: null,
        steps: markFirstPendingStepFailed(state.steps, event.error),
      }

    case 'task_cancelled':
      return {
        ...state,
        status: 'cancelled',
        error: event.reason ?? null,
        durationMs: event.durationMs ?? state.durationMs,
        pendingApproval: null,
      }

    default:
      return state
  }
}

function upsertStep(steps: LiveStep[], patch: Partial<LiveStep> & { index: number }): LiveStep[] {
  const existing = steps.find((s) => s.index === patch.index)
  if (existing) {
    return steps.map((s) => (s.index === patch.index ? { ...s, ...patch } : s))
  }
  const { index, ...restPatch } = patch
  return [
    ...steps,
    {
      ...restPatch,
      index,
      actionType: patch.actionType ?? '?',
      description: patch.description ?? '',
      status: patch.status ?? 'pending',
    },
  ].sort((a, b) => a.index - b.index)
}

function markFirstPendingStepFailed(steps: LiveStep[], error: string): LiveStep[] {
  if (steps.some((step) => step.status === 'failed')) {
    return steps
  }

  const targetIndex = steps.findIndex((step) => step.status === 'pending' || step.status === 'running')
  if (targetIndex === -1) {
    return steps
  }

  return steps.map((step, index) =>
    index === targetIndex
      ? {
          ...step,
          status: 'failed',
          error: step.error ?? error,
        }
      : step
  )
}

function reconcileWithTaskSnapshot(
  state: StreamState,
  snapshot: { taskId: string; plan: { status: string; steps: Array<{ step: number; status: string; action: { type: string; description: string }; result?: string; error?: string; durationMs?: number; screenshot?: string }> }; error?: string }
): StreamState {
  const steps = snapshot.plan.steps.map((step) => ({
    index: step.step,
    actionType: step.action.type,
    description: step.action.description,
    status: step.status as LiveStep['status'],
    result: step.result,
    error: step.error,
    durationMs: step.durationMs,
    hasScreenshot: Boolean(step.screenshot),
  }))

  if (snapshot.plan.status === 'done') {
    return {
      ...state,
      steps,
      stepCount: steps.length,
      status: 'done',
      error: null,
    }
  }

  if (snapshot.plan.status === 'failed') {
    return {
      ...state,
      steps,
      stepCount: steps.length,
      status: 'failed',
      error: snapshot.error ?? 'Task failed during execution.',
    }
  }

  if (snapshot.plan.status === 'cancelled') {
    return {
      ...state,
      steps,
      stepCount: steps.length,
      status: 'cancelled',
      error: snapshot.error ?? null,
    }
  }

  if (snapshot.plan.status === 'awaiting_approval') {
    return {
      ...state,
      steps,
      stepCount: steps.length,
      status: 'awaiting_approval',
    }
  }

  return {
    ...state,
    steps,
    stepCount: steps.length,
    status: 'error',
    error: 'Stream disconnected while the task was still running. Retry the stream or rerun the task.',
  }
}
