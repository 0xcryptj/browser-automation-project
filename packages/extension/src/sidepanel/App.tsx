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
  const [pageAccessMessage, setPageAccessMessage] = useState<string | null>(null)
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
      setRunnerWarning(health.browserTarget?.warning ?? health.planner.warning ?? null)
      setRunnerDetails(
        health.browser?.browserConnected
          ? `Runner ready. Planner: ${health.planner.provider}/${health.planner.model ?? 'default'} · Browser: ${health.browserTarget?.mode ?? 'launch'}${health.browser.activePageUrl ? ` on ${safeHostname(health.browser.activePageUrl)}` : ''}`
          : `Runner connected. Planner: ${health.planner.provider}/${health.planner.model ?? 'default'} · Browser: ${health.browserTarget?.mode ?? 'launch'}${health.browserTarget?.mode === 'attach' ? ' (waiting for your Brave or Chrome session)' : '. Browser launches on first task.'}`
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
          // Require timestamp to distinguish a full observation from the background
          // fallback stub { url, title } that is returned when the content script
          // cannot inject (restricted pages, new-tab, etc.).
          if (
            chrome.runtime.lastError ||
            !response ||
            response.error ||
            typeof response.timestamp !== 'number'
          ) {
            setPageAccessMessage(
              chrome.runtime.lastError?.message ??
                response?.error ??
                'The assistant could not inspect this tab. Try a normal web page instead of a browser-internal page.'
            )
            resolve(null)
            return
          }
          setPageAccessMessage(null)
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

      if (!observation && needsCurrentPageContext(prompt)) {
        setPageAccessMessage(
          'This task needs access to the current page, but the extension could not inspect this tab. Open a normal website tab and try again.'
        )
        return
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
        background: '#0a0a0a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 14px',
          borderBottom: '1px solid #1a1a1a',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              background: '#6366f1',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 500, color: '#4b5563', letterSpacing: '0.04em', fontFamily: 'monospace' }}>
            browser-operator
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tab === 'tasks' && hasResult && !isRunning && (
            <button
              onClick={reset}
              style={{
                background: 'none',
                border: '1px solid #1e1e1e',
                borderRadius: 0,
                color: '#4b5563',
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
                border: '1px solid #ef444430',
                borderRadius: 0,
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
            background: '#0c0505',
            padding: '5px 14px',
            fontSize: 11,
            color: '#ef4444',
            borderBottom: '1px solid #ef444420',
            flexShrink: 0,
            fontFamily: 'monospace',
          }}
        >
          Runner offline at <code style={{ opacity: 0.7 }}>{runnerUrl}</code> — run{' '}
          <code style={{ opacity: 0.7 }}>pnpm runner:dev</code>
        </div>
      )}

      {runnerStatus === 'connected' && runnerDetails && (
        <div
          style={{
            background: '#050c08',
            padding: '5px 14px',
            fontSize: 10,
            color: '#16a34a',
            borderBottom: '1px solid #16a34a20',
            flexShrink: 0,
            fontFamily: 'monospace',
            letterSpacing: '0.02em',
          }}
        >
          {runnerDetails}
        </div>
      )}

      {runnerStatus === 'connected' && runnerWarning && (
        <div
          style={{
            background: '#0c0a00',
            padding: '5px 14px',
            fontSize: 10,
            color: '#ca8a04',
            borderBottom: '1px solid #ca8a0420',
            flexShrink: 0,
            fontFamily: 'monospace',
          }}
        >
          {runnerWarning}
        </div>
      )}

      {pageAccessMessage && (
        <div
          style={{
            background: '#0c0a00',
            padding: '5px 14px',
            fontSize: 10,
            color: '#ca8a04',
            borderBottom: '1px solid #ca8a0420',
            flexShrink: 0,
            fontFamily: 'monospace',
          }}
        >
          {pageAccessMessage}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #1a1a1a',
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
              borderBottom: tab === id ? '1px solid #6366f1' : '1px solid transparent',
              color: tab === id ? '#9ca3af' : '#374151',
              fontSize: 11,
              fontWeight: 500,
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
                  background: 'transparent',
                  border: '1px solid #1e1e1e',
                  borderRadius: 0,
                  color: '#4b5563',
                  fontSize: 11,
                  padding: '5px 10px',
                  cursor: 'pointer',
                }}
              >
                Retry Stream
              </button>
            )}

            {state.status === 'error' && !state.taskId && state.prompt && (
              <button
                onClick={() => void handleSubmit(state.prompt)}
                style={{
                  alignSelf: 'flex-start',
                  background: 'transparent',
                  border: '1px solid #1e1e1e',
                  borderRadius: 0,
                  color: '#4b5563',
                  fontSize: 11,
                  padding: '5px 10px',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
            )}

            {!hasResult && (
              <div
                style={{
                  fontSize: 11,
                  padding: '16px 0',
                  userSelect: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ color: '#222', marginBottom: 8, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'monospace' }}>
                  examples
                </div>
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
                      background: 'transparent',
                      border: '1px solid #141414',
                      borderRadius: 0,
                      color: '#333',
                      fontSize: 11,
                      padding: '5px 10px',
                      cursor: isRunning || runnerStatus !== 'connected' ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'monospace',
                    }}
                  >
                    {examplePrompt}
                  </button>
                ))}
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
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.15; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 0; }
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

function needsCurrentPageContext(prompt: string) {
  const normalized = prompt.toLowerCase()
  return [
    'this page',
    'current page',
    'what am i viewing',
    'what im viewing',
    'what i am viewing',
    'read the page',
    'tell me about the page',
    'tell me about this page',
    'summarize this page',
    'fill this form',
    'fill out this form',
    'click the',
    'type into',
    'write a review',
    'review this place',
  ].some((phrase) => normalized.includes(phrase))
}
