import { useState, useEffect, useRef, useCallback } from 'react'
import type { TaskEvent } from '@browser-automation/shared'

const RUNNER = 'http://127.0.0.1:3000'

export type LiveStep = {
  index: number
  actionType: string
  description: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'awaiting_approval' | 'skipped'
  result?: string
  error?: string
  hasScreenshot?: boolean
}

export type StreamState = {
  taskId: string | null
  prompt: string
  status: 'idle' | 'submitting' | 'streaming' | 'done' | 'failed' | 'awaiting_approval' | 'error'
  steps: LiveStep[]
  stepCount: number
  durationMs: number | null
  error: string | null
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
  pendingApproval: null,
}

export function useTaskStream() {
  const [state, setState] = useState<StreamState>(INITIAL)
  const esRef = useRef<EventSource | null>(null)

  const closeStream = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
  }, [])

  const openStream = useCallback((taskId: string) => {
    closeStream()
    const es = new EventSource(`${RUNNER}/task/${taskId}/stream`)
    esRef.current = es

    es.onmessage = (e) => {
      let event: TaskEvent
      try {
        event = JSON.parse(e.data) as TaskEvent
      } catch {
        return
      }

      setState((prev) => applyEvent(prev, event))

      if (event.type === 'task_completed' || event.type === 'task_error') {
        // Give 300ms for any final events, then close
        setTimeout(closeStream, 300)
      }
    }

    es.onerror = () => {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'Lost connection to runner.',
      }))
      closeStream()
    }
  }, [closeStream])

  const submitTask = useCallback(
    async (prompt: string, pageContext?: Record<string, unknown>) => {
      closeStream()
      setState({ ...INITIAL, prompt, status: 'submitting' })

      try {
        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const body = JSON.stringify({ id: taskId, prompt, ...pageContext })

        const res = await fetch(`${RUNNER}/task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }))
          setState((prev) => ({ ...prev, status: 'error', error: err.error ?? 'Request failed' }))
          return
        }

        const data = await res.json()
        const id: string = data.taskId ?? taskId

        setState((prev) => ({
          ...prev,
          taskId: id,
          status: 'streaming',
          stepCount: data.plan?.steps?.length ?? 0,
          steps: (data.plan?.steps ?? []).map((s: { step: number; action: { type: string; description: string }; status: string }) => ({
            index: s.step,
            actionType: s.action.type,
            description: s.action.description,
            status: s.status,
          })),
        }))

        openStream(id)
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : 'Runner unreachable',
        }))
      }
    },
    [closeStream, openStream]
  )

  const approve = useCallback(
    async (taskId: string, stepIndex: number, approved: boolean) => {
      setState((prev) => ({ ...prev, pendingApproval: null, status: 'streaming' }))
      closeStream()

      const res = await fetch(`${RUNNER}/task/${taskId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, stepIndex, approved }),
      })

      if (res.ok) {
        openStream(taskId)
      } else {
        setState((prev) => ({ ...prev, status: 'error', error: 'Approval request failed' }))
      }
    },
    [closeStream, openStream]
  )

  const reset = useCallback(() => {
    closeStream()
    setState(INITIAL)
  }, [closeStream])

  // Cleanup on unmount
  useEffect(() => closeStream, [closeStream])

  return { state, submitTask, approve, reset }
}

// ── Pure state reducer ────────────────────────────────────────────────────

function applyEvent(state: StreamState, event: TaskEvent): StreamState {
  switch (event.type) {
    case 'task_started':
      return { ...state, status: 'streaming', error: null }

    case 'plan_created':
      return { ...state, stepCount: event.stepCount }

    case 'step_started': {
      const steps = upsertStep(state.steps, {
        index: event.stepIndex,
        actionType: event.actionType,
        description: event.description,
        status: 'running',
      })
      return { ...state, steps }
    }

    case 'step_succeeded': {
      const steps = upsertStep(state.steps, {
        index: event.stepIndex,
        status: 'done',
        result: event.result,
        hasScreenshot: event.hasScreenshot,
      })
      return { ...state, steps }
    }

    case 'step_failed': {
      const steps = upsertStep(state.steps, {
        index: event.stepIndex,
        status: 'failed',
        error: event.error,
      })
      return { ...state, steps }
    }

    case 'approval_required': {
      const steps = upsertStep(state.steps, {
        index: event.stepIndex,
        status: 'awaiting_approval',
      })
      return { ...state, steps, status: 'awaiting_approval', pendingApproval: event }
    }

    case 'task_completed':
      return {
        ...state,
        status: event.status === 'done' ? 'done' : 'failed',
        durationMs: event.durationMs,
      }

    case 'task_error':
      return { ...state, status: 'error', error: event.error }

    default:
      return state
  }
}

function upsertStep(
  steps: LiveStep[],
  patch: Partial<LiveStep> & { index: number }
): LiveStep[] {
  const existing = steps.find((s) => s.index === patch.index)
  if (existing) {
    return steps.map((s) => (s.index === patch.index ? { ...s, ...patch } : s))
  }
  return [
    ...steps,
    {
      index: patch.index,
      actionType: patch.actionType ?? '?',
      description: patch.description ?? '',
      status: patch.status ?? 'pending',
      ...patch,
    },
  ].sort((a, b) => a.index - b.index)
}
