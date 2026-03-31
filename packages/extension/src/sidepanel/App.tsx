import { useState, useEffect, useCallback, useRef } from 'react'
import { getDefaultObservationOptions } from '@browser-automation/shared'
import type { ObservationOptions, PageObservation } from '@browser-automation/shared'
import { useTaskStream } from './hooks/useTaskStream.js'
import { TaskInput } from './components/TaskInput.js'
import { LiveTaskView } from './components/LiveTaskView.js'
import { ApprovalModal } from './components/ApprovalModal.js'
import { StatusBadge } from './components/StatusBadge.js'
import { AssistPanel } from './panels/AssistPanel.js'
import { TaskHistory } from './panels/TaskHistory.js'
import { SettingsPanel } from './panels/SettingsPanel.js'
import { ObservationViewer } from './panels/ObservationViewer.js'
import { addHistoryEntry, getSettings } from '../lib/storage.js'
import { runnerClient } from '../lib/runnerClient.js'

type Tab = 'tasks' | 'assist' | 'observe' | 'history' | 'settings'
type RunnerStatus = 'checking' | 'connected' | 'disconnected'

const TABS: { id: Tab; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'assist', label: 'Assist' },
  { id: 'observe', label: 'Observe' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('tasks')
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>('checking')
  const [runnerUrl, setRunnerUrl] = useState('http://localhost:3000')
  const [runnerDetails, setRunnerDetails] = useState<string | null>(null)
  const [runnerWarning, setRunnerWarning] = useState<string | null>(null)
  const [pageObservation, setPageObservation] = useState<PageObservation | null>(null)
  const [observeLoading, setObserveLoading] = useState(false)
  const { state, submitTask, approve, cancel, reset, retryStream } = useTaskStream()
  const prevStatus = useRef(state.status)

  const checkRunner = useCallback(async () => {
    setRunnerStatus('checking')
    try {
      const settings = await getSettings()
      const baseUrl = settings.runnerBaseUrl.replace(/\/$/, '')
      setRunnerUrl(baseUrl)

      const health = await runnerClient.health()
      setRunnerStatus(health.status === 'ok' ? 'connected' : 'disconnected')
      setRunnerWarning(health.planner.warning ?? null)
      setRunnerDetails(
        health.browser?.browserConnected
          ? `Runner ready. Planner: ${health.planner.provider}/${health.planner.model ?? 'default'}${health.browser.activePageUrl ? ` on ${safeHostname(health.browser.activePageUrl)}` : ''}`
          : `Runner connected. Planner: ${health.planner.provider}/${health.planner.model ?? 'default'}. Browser launches on first task.`
      )
    } catch {
      setRunnerStatus('disconnected')
      setRunnerDetails(null)
      setRunnerWarning(null)
    }
  }, [])

  useEffect(() => {
    void checkRunner()
    const id = setInterval(() => {
      void checkRunner()
    }, 20_000)
    return () => clearInterval(id)
  }, [checkRunner])

  useEffect(() => {
    const prev = prevStatus.current
    prevStatus.current = state.status

    const shouldPersistHistory =
      (state.status === 'done' ||
        state.status === 'failed' ||
        state.status === 'cancelled' ||
        state.status === 'awaiting_approval') &&
      prev !== state.status

    if (shouldPersistHistory && state.taskId && state.prompt) {
      const taskId = state.taskId
      const prompt = state.prompt
      const status = state.status
      getSettings().then((settings) => {
        addHistoryEntry(
          {
            id: taskId,
            prompt,
            status,
            stepCount: state.steps.length,
            durationMs: state.durationMs ?? undefined,
            timestamp: Date.now(),
          },
          settings.maxHistoryEntries
        ).catch(() => {})
      })
    }
  }, [state.status, state.taskId, state.prompt, state.steps.length, state.durationMs])

  const collectPage = useCallback(async (mode: 'task' | 'observe' = 'observe'): Promise<PageObservation | null> => {
    setObserveLoading(true)
    try {
      const options: ObservationOptions = getDefaultObservationOptions(mode)
      const observation = await new Promise<PageObservation | null>((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTEXT', options }, (response) => {
          if (chrome.runtime.lastError || !response || response.error) {
            resolve(null)
            return
          }
          resolve(response as PageObservation)
        })
      })
      setPageObservation(observation)
      return observation
    } catch {
      return null
    } finally {
      setObserveLoading(false)
    }
  }, [])

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (runnerStatus !== 'connected') {
        return
      }

      setTab('tasks')

      let observation: PageObservation | null = null
      try {
        observation = await collectPage('task')
      } catch {
        observation = null
      }

      await submitTask(prompt, observation, 'standard')
    },
    [collectPage, runnerStatus, submitTask]
  )

  const handleRerun = useCallback(
    (prompt: string) => {
      reset()
      setTab('tasks')
      setTimeout(() => {
        void handleSubmit(prompt)
      }, 50)
    },
    [reset, handleSubmit]
  )

  const isRunning =
    state.status === 'streaming' ||
    state.status === 'submitting' ||
    state.status === 'planning'

  const hasResult =
    state.status === 'done' ||
    state.status === 'failed' ||
    state.status === 'error' ||
    state.status === 'awaiting_approval' ||
    state.status === 'cancelled' ||
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #1a1a2e',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 15 }}>AI</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.01em' }}>
            Browser Operator
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tab === 'tasks' && hasResult && !isRunning && (
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

          {tab === 'tasks' && isRunning && (
            <button
              onClick={() => void cancel()}
              style={{
                background: 'none',
                border: '1px solid #ef444444',
                borderRadius: 5,
                color: '#ef4444',
                fontSize: 11,
                padding: '3px 8px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}

          <button
            onClick={() => void checkRunner()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
            title="Check runner connection"
          >
            <StatusBadge status={runnerStatus} />
          </button>
        </div>
      </div>

      {runnerStatus === 'disconnected' && (
        <div
          style={{
            background: '#1a0a0a',
            padding: '6px 14px',
            fontSize: 11,
            color: '#ef4444',
            borderBottom: '1px solid #ef444422',
            flexShrink: 0,
          }}
        >
          Runner offline at{' '}
          <code style={{ background: '#0f0f1a', padding: '1px 4px', borderRadius: 3 }}>
            {runnerUrl}
          </code>{' '}
          - start it with{' '}
          <code style={{ background: '#0f0f1a', padding: '1px 4px', borderRadius: 3 }}>
            pnpm runner:dev
          </code>
        </div>
      )}

      {runnerStatus === 'connected' && runnerDetails && (
        <div
          style={{
            background: '#08130d',
            padding: '6px 14px',
            fontSize: 11,
            color: '#22c55e',
            borderBottom: '1px solid #22c55e22',
            flexShrink: 0,
          }}
        >
          {runnerDetails}
        </div>
      )}

      {runnerStatus === 'connected' && runnerWarning && (
        <div
          style={{
            background: '#1a1500',
            padding: '6px 14px',
            fontSize: 11,
            color: '#f59e0b',
            borderBottom: '1px solid #f59e0b22',
            flexShrink: 0,
          }}
        >
          {runnerWarning}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #1a1a2e',
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab === id ? '2px solid #6366f1' : '2px solid transparent',
              color: tab === id ? '#e2e8f0' : '#475569',
              fontSize: 12,
              fontWeight: 600,
              padding: '7px 12px',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'color 0.1s',
            }}
          >
            {label}
            {id === 'tasks' && isRunning && (
              <span
                style={{
                  display: 'inline-block',
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#f59e0b',
                  marginLeft: 5,
                  verticalAlign: 'middle',
                  animation: 'pulse 1s ease-in-out infinite',
                }}
              />
            )}
          </button>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 14,
        }}
      >
        {tab === 'tasks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TaskInput onSubmit={handleSubmit} disabled={isRunning || runnerStatus !== 'connected'} />

            {hasResult && <LiveTaskView state={state} />}

            {state.status === 'error' && state.taskId && (
              <button
                onClick={() => void retryStream()}
                style={{
                  alignSelf: 'flex-start',
                  background: '#1e1e2e',
                  border: '1px solid #313150',
                  borderRadius: 6,
                  color: '#cbd5e1',
                  fontSize: 11,
                  padding: '6px 10px',
                  cursor: 'pointer',
                }}
              >
                Retry Stream
              </button>
            )}

            {!hasResult && (
              <div
                style={{
                  textAlign: 'center',
                  fontSize: 12,
                  padding: '24px 16px',
                  userSelect: 'none',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 10 }}>WEB</div>
                <div style={{ color: '#334155' }}>Describe a task and I&apos;ll automate it.</div>
                <div style={{ color: '#1e293b', fontSize: 11, marginTop: 4 }}>
                  I&apos;ll ground each task on the current page before acting.
                </div>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[
                    'Go to example.com',
                    'Extract the main heading',
                    'Search for TypeScript on google.com',
                    'Take a screenshot of this page',
                  ].map((examplePrompt) => (
                    <button
                      key={examplePrompt}
                      onClick={() => void handleSubmit(examplePrompt)}
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
                      {examplePrompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'assist' && <AssistPanel pageObservation={pageObservation} onCollectPage={collectPage} />}

        {tab === 'observe' && (
          <ObservationViewer
            observation={pageObservation}
            onRefresh={collectPage}
            loading={observeLoading}
          />
        )}

        {tab === 'history' && <TaskHistory onRerun={handleRerun} />}

        {tab === 'settings' && <SettingsPanel />}
      </div>

      {state.pendingApproval && state.taskId && (
        <ApprovalModal
          taskId={state.taskId}
          step={{
            step: state.pendingApproval.stepIndex,
            action: state.pendingApproval.action,
            status: 'awaiting_approval',
          }}
          onApprove={(taskId, stepIndex, approved) => void approve(taskId, stepIndex, approved)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2040; border-radius: 2px; }
      `}</style>
    </div>
  )
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
