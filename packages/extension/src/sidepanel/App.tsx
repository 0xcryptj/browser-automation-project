import { useState, useEffect, useCallback } from 'react'
import { nanoid } from 'nanoid'
import type { TaskResult, ActionStep } from '@browser-automation/shared'
import { TaskInput } from './components/TaskInput.js'
import { ResultDisplay } from './components/ResultDisplay.js'
import { ApprovalModal } from './components/ApprovalModal.js'
import { StatusBadge } from './components/StatusBadge.js'

type RunnerStatus = 'checking' | 'connected' | 'disconnected'

function sendMessage<T>(type: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else if (response?.ok === false) {
        reject(new Error(response.error ?? 'Unknown error'))
      } else {
        resolve(response?.data ?? response)
      }
    })
  })
}

export default function App() {
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>('checking')
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<TaskResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingApproval, setPendingApproval] = useState<{
    taskId: string
    step: ActionStep
  } | null>(null)

  const checkRunner = useCallback(async () => {
    setRunnerStatus('checking')
    try {
      await sendMessage('RUNNER_HEALTH')
      setRunnerStatus('connected')
    } catch {
      setRunnerStatus('disconnected')
    }
  }, [])

  useEffect(() => {
    checkRunner()
    const interval = setInterval(checkRunner, 15_000)
    return () => clearInterval(interval)
  }, [checkRunner])

  const handleSubmit = async (prompt: string) => {
    if (runnerStatus !== 'connected') {
      setError('Runner is offline. Start it with: pnpm runner:dev')
      return
    }

    setIsRunning(true)
    setResult(null)
    setError(null)
    setPendingApproval(null)

    try {
      // Collect page context from the active tab
      let observation: unknown
      try {
        observation = await sendMessage('GET_PAGE_CONTEXT')
      } catch {
        // non-fatal: proceed without page context
      }

      const taskRequest = {
        id: nanoid(),
        prompt,
        ...(observation as Record<string, unknown>),
      }

      const taskResult = await sendMessage<TaskResult>('SEND_TASK', taskRequest)

      // Check if the plan needs approval before proceeding
      if (taskResult.plan.status === 'awaiting_approval') {
        const approvalStep = taskResult.plan.steps.find(
          (s) => s.action.requiresApproval && s.status === 'pending'
        )
        if (approvalStep) {
          setPendingApproval({ taskId: taskResult.taskId, step: approvalStep })
          setResult(taskResult)
          setIsRunning(false)
          return
        }
      }

      setResult(taskResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRunning(false)
    }
  }

  const handleApproval = async (taskId: string, stepIndex: number, approved: boolean) => {
    setPendingApproval(null)
    setIsRunning(true)
    setError(null)

    try {
      const taskResult = await sendMessage<TaskResult>('APPROVE_STEP', {
        taskId,
        stepIndex,
        approved,
      })
      setResult(taskResult)

      // Check if there's another approval needed
      const nextApproval = taskResult.plan.steps.find(
        (s) => s.action.requiresApproval && s.status === 'pending'
      )
      if (nextApproval) {
        setPendingApproval({ taskId: taskResult.taskId, step: nextApproval })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: '#0f0f13',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid #1e1e2e',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
            Browser Automation
          </span>
        </div>
        <button
          onClick={checkRunner}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          title="Refresh runner status"
        >
          <StatusBadge status={runnerStatus} />
        </button>
      </div>

      {/* Runner offline banner */}
      {runnerStatus === 'disconnected' && (
        <div
          style={{
            background: '#1a0a0a',
            border: '1px solid #ef444433',
            borderRadius: 0,
            padding: '8px 14px',
            fontSize: 11,
            color: '#ef4444',
            flexShrink: 0,
          }}
        >
          Runner offline. Run:{' '}
          <code style={{ background: '#0f0f1a', padding: '1px 4px', borderRadius: 3 }}>
            pnpm runner:dev
          </code>
        </div>
      )}

      {/* Main content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Task input */}
        <TaskInput onSubmit={handleSubmit} disabled={isRunning} />

        {/* Error */}
        {error && (
          <div
            style={{
              background: '#1a0a0a',
              border: '1px solid #ef444433',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12,
              color: '#ef4444',
            }}
          >
            {error}
          </div>
        )}

        {/* Running indicator */}
        {isRunning && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#f59e0b',
              padding: '8px 12px',
              background: '#1a1500',
              borderRadius: 8,
              border: '1px solid #f59e0b22',
            }}
          >
            <span style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
            Executing…
          </div>
        )}

        {/* Result */}
        {result && !isRunning && <ResultDisplay result={result} />}

        {/* Empty state */}
        {!result && !isRunning && !error && (
          <div
            style={{
              textAlign: 'center',
              color: '#334155',
              fontSize: 12,
              padding: '32px 16px',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>🌐</div>
            <div>Describe a task and I'll automate it.</div>
            <div style={{ marginTop: 8, color: '#1e293b' }}>
              "Go to example.com and take a screenshot"
            </div>
          </div>
        )}
      </div>

      {/* Approval modal */}
      {pendingApproval && (
        <ApprovalModal
          taskId={pendingApproval.taskId}
          step={pendingApproval.step}
          onApprove={handleApproval}
        />
      )}
    </div>
  )
}
