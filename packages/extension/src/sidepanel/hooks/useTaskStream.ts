import { useState, useEffect, useRef, useCallback } from 'react'
import type { PageObservation, TaskEvent } from '@browser-automation/shared'
import { runnerClient } from '../../lib/runnerClient.js'
import { getSettings } from '../../lib/storage.js'

export type LiveStep = {
  index: number
  actionType: string
  description: string
  selector?: string
  elementRef?: string
  targetLabel?: string
  pageUrl?: string
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

  const updateOverlay = useCallback(
    (message: { type: 'TASK_OVERLAY_SHOW' | 'TASK_OVERLAY_CLEAR'; payload?: Record<string, unknown> }) => {
      try {
        chrome.runtime.sendMessage(message, () => {
          void chrome.runtime.lastError
        })
      } catch {
        // Ignore overlay messaging failures on restricted pages.
      }
    },
    []
  )

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
        syncOverlay(event, updateOverlay)
        if (event.type === 'task_completed' || event.type === 'task_failed' || event.type === 'task_cancelled') {
          setTimeout(closeStream, 400)
        }
      }

      es.onerror = async () => {
        closeStream()

        try {
          const snapshot = await runnerClient.getTask(taskId)
          setState((prev) => reconcileWithTaskSnapshot(prev, snapshot))
          updateOverlay({ type: 'TASK_OVERLAY_CLEAR' })
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
    [closeStream, updateOverlay]
  )

  const submitTask = useCallback(
    async (prompt: string, observation?: PageObservation | null, mode: 'standard' | 'assist' = 'standard') => {
      closeStream()
      updateOverlay({ type: 'TASK_OVERLAY_CLEAR' })
      setState({ ...INITIAL, prompt, status: 'submitting' })

      try {
        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

        setState((prev) => ({ ...prev, status: 'planning' }))

        const data = await runnerClient.submitTask({
          id: taskId,
          prompt,
          mode,
          // Only forward the URL if it's a valid http/https URL — the runner's
          // Zod schema uses z.string().url() which rejects chrome://, about:,
          // empty strings, etc. If there's no valid URL, send undefined so the
          // runner can fall back to whatever the browser has open.
          url: isHttpUrl(observation?.url) ? observation!.url : undefined,
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
    [closeStream, openStream, updateOverlay]
  )

  const approve = useCallback(
    async (taskId: string, stepIndex: number, approved: boolean) => {
      setState((prev) => ({ ...prev, pendingApproval: null, status: 'streaming' }))
      closeStream()
      updateOverlay({ type: 'TASK_OVERLAY_CLEAR' })
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
    [closeStream, openStream, updateOverlay]
  )

  const cancel = useCallback(
    async () => {
      if (state.taskId) {
        await runnerClient.cancel(state.taskId).catch(() => {})
      }
      closeStream()
      updateOverlay({ type: 'TASK_OVERLAY_CLEAR' })
      setState((prev) => ({ ...prev, status: 'cancelled' }))
    },
    [state.taskId, closeStream, updateOverlay]
  )

  const reset = useCallback(() => {
    closeStream()
    updateOverlay({ type: 'TASK_OVERLAY_CLEAR' })
    setState(INITIAL)
  }, [closeStream, updateOverlay])

  const retryStream = useCallback(async () => {
    if (!state.taskId) return
    setState((prev) => ({ ...prev, error: null }))
    await openStream(state.taskId)
  }, [openStream, state.taskId])

  useEffect(
    () => () => {
      closeStream()
      updateOverlay({ type: 'TASK_OVERLAY_CLEAR' })
    },
    [closeStream, updateOverlay]
  )

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
          selector: event.selector,
          elementRef: event.elementRef,
          targetLabel: event.targetLabel,
          pageUrl: event.pageUrl,
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
          selector: event.action.selector ?? undefined,
          elementRef: event.action.elementRef ?? undefined,
          targetLabel: event.action.selector ?? event.action.elementRef ?? undefined,
          pageUrl: event.pageUrl,
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

function isHttpUrl(url: string | undefined): url is string {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))
}

function syncOverlay(
  event: TaskEvent,
  updateOverlay: (message: { type: 'TASK_OVERLAY_SHOW' | 'TASK_OVERLAY_CLEAR'; payload?: Record<string, unknown> }) => void
) {
  switch (event.type) {
    case 'step_started':
      updateOverlay({
        type: 'TASK_OVERLAY_SHOW',
        payload: {
          taskId: event.taskId,
          actionType: event.actionType,
          description: event.description,
          selector: event.selector,
          elementRef: event.elementRef,
          targetLabel: event.targetLabel,
          pageUrl: event.pageUrl,
          status: 'running',
        },
      })
      return

    case 'approval_required':
      updateOverlay({
        type: 'TASK_OVERLAY_SHOW',
        payload: {
          taskId: event.taskId,
          actionType: event.action.type,
          description: event.action.description,
          selector: event.action.selector ?? undefined,
          elementRef: event.action.elementRef ?? undefined,
          targetLabel: event.action.selector ?? event.action.elementRef ?? undefined,
          pageUrl: event.pageUrl,
          status: 'awaiting_approval',
        },
      })
      return

    case 'task_completed':
    case 'task_failed':
    case 'task_cancelled':
      updateOverlay({ type: 'TASK_OVERLAY_CLEAR' })
      return

    default:
      return
  }
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
