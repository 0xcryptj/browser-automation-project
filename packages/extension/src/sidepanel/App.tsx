import { useState, useEffect, useCallback } from 'react'
import { useTaskStream } from './hooks/useTaskStream.js'
import { TaskInput } from './components/TaskInput.js'
import { LiveTaskView } from './components/LiveTaskView.js'
import { ApprovalModal } from './components/ApprovalModal.js'
import { StatusBadge } from './components/StatusBadge.js'

type RunnerStatus = 'checking' | 'connected' | 'disconnected'

const RUNNER = 'http://127.0.0.1:3000'

export default function App() {
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>('checking')
  const { state, submitTask, approve, reset } = useTaskStream()

  const checkRunner = useCallback(async () => {
    setRunnerStatus('checking')
    try {
      const r = await fetch(`${RUNNER}/health`)
      setRunnerStatus(r.ok ? 'connected' : 'disconnected')
    } catch {
      setRunnerStatus('disconnected')
    }
  }, [])

  useEffect(() => {
    checkRunner()
    const id = setInterval(checkRunner, 20_000)
    return () => clearInterval(id)
  }, [checkRunner])

  const handleSubmit = async (prompt: string) => {
    if (runnerStatus !== 'connected') return

    // Grab page context from the active tab via content script
    let pageContext: Record<string, unknown> | undefined
    try {
      pageContext = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTEXT' }, (resp) => {
          resolve(resp ?? {})
        })
      })
    } catch {
      // non-fatal
    }

    await submitTask(prompt, pageContext)
  }

  const isRunning = state.status === 'streaming' || state.status === 'submitting'
  const hasResult =
    state.status === 'done' ||
    state.status === 'failed' ||
    state.status === 'error' ||
    state.status === 'awaiting_approval' ||
    state.steps.length > 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: '#0f0f13',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '11px 14px',
          borderBottom: '1px solid #1a1a2e',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 15 }}>🤖</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.01em' }}>
            Browser Operator
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasResult && !isRunning && (
            <button
              onClick={reset}
              style={{
                background: 'none',
                border: '1px solid #313150',
                borderRadius: 5,
                color: '#64748b',
                fontSize: 11,
                padding: '3px 8px',
                cursor: 'pointer',
              }}
            >
              New
            </button>
          )}
          <button
            onClick={checkRunner}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
            title="Refresh runner connection"
          >
            <StatusBadge status={runnerStatus} />
          </button>
        </div>
      </div>

      {/* Offline banner */}
      {runnerStatus === 'disconnected' && (
        <div
          style={{
            background: '#1a0a0a',
            padding: '7px 14px',
            fontSize: 11,
            color: '#ef4444',
            borderBottom: '1px solid #ef444422',
            flexShrink: 0,
          }}
        >
          Runner offline —{' '}
          <code style={{ background: '#0f0f1a', padding: '1px 4px', borderRadius: 3 }}>
            pnpm runner:dev
          </code>
        </div>
      )}

      {/* Scrollable body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Input — always visible */}
        <TaskInput
          onSubmit={handleSubmit}
          disabled={isRunning || runnerStatus !== 'connected'}
        />

        {/* Live task view */}
        {hasResult && <LiveTaskView state={state} />}

        {/* Empty state */}
        {!hasResult && (
          <div
            style={{
              textAlign: 'center',
              color: '#1e293b',
              fontSize: 12,
              padding: '28px 16px',
              userSelect: 'none',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>🌐</div>
            <div style={{ color: '#334155' }}>Describe a task and I'll automate it.</div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                'Go to example.com',
                'Extract the main heading',
                'Search for TypeScript on google.com',
                'Take a screenshot',
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleSubmit(ex)}
                  disabled={isRunning || runnerStatus !== 'connected'}
                  style={{
                    background: '#1a1a2a',
                    border: '1px solid #1e2040',
                    borderRadius: 6,
                    color: '#475569',
                    fontSize: 11,
                    padding: '5px 10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Approval modal */}
      {state.pendingApproval && state.taskId && (
        <ApprovalModal
          taskId={state.taskId}
          step={{
            step: state.pendingApproval.stepIndex,
            action: state.pendingApproval.action,
            status: 'awaiting_approval',
          }}
          onApprove={(taskId, stepIndex, approved) => approve(taskId, stepIndex, approved)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
