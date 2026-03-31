import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { getDefaultObservationOptions } from '@browser-automation/shared'
import type { ExtensionSettings, ObservationOptions, PageObservation } from '@browser-automation/shared'
import { useTaskStream } from './hooks/useTaskStream.js'
import { TaskInput } from './components/TaskInput.js'
import { LiveTaskView } from './components/LiveTaskView.js'
import { ApprovalModal } from './components/ApprovalModal.js'
import { StatusBadge } from './components/StatusBadge.js'
import { AssistPanel } from './panels/AssistPanel.js'
import { TaskHistory } from './panels/TaskHistory.js'
import { SettingsPanel } from './panels/SettingsPanel.js'
import { ObservationViewer } from './panels/ObservationViewer.js'
import { addHistoryEntry, getSettings, saveSettings } from '../lib/storage.js'
import { runnerClient } from '../lib/runnerClient.js'

type Tab = 'tasks' | 'assist' | 'observe' | 'history' | 'settings'
type RunnerStatus = 'checking' | 'connected' | 'disconnected'
type ResolvedTheme = 'dark' | 'light'

const NAV_ITEMS: Array<{ id: Tab; label: string; description: string }> = [
  { id: 'tasks', label: 'Tasks', description: 'Run browser actions and ask follow-up questions.' },
  { id: 'assist', label: 'Assist', description: 'Summaries, dates, warnings, and next steps.' },
  { id: 'observe', label: 'Observe', description: 'Inspect the current page snapshot and refs.' },
  { id: 'history', label: 'History', description: 'Rerun or review recent tasks.' },
  { id: 'settings', label: 'Settings', description: 'Runner, browser target, provider, and profile.' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('tasks')
  const [menuOpen, setMenuOpen] = useState(false)
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>('checking')
  const [runnerUrl, setRunnerUrl] = useState('http://localhost:3000')
  const [runnerDetails, setRunnerDetails] = useState<string | null>(null)
  const [runnerWarning, setRunnerWarning] = useState<string | null>(null)
  const [extensionSettings, setExtensionSettings] = useState<ExtensionSettings | null>(null)
  const [pageObservation, setPageObservation] = useState<PageObservation | null>(null)
  const [observeLoading, setObserveLoading] = useState(false)
  const [pageAccessMessage, setPageAccessMessage] = useState<string | null>(null)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('dark')
  const { state, submitTask, approve, cancel, reset, retryStream } = useTaskStream()
  const prevStatus = useRef(state.status)

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (extensionSettings?.theme === 'light') return 'light'
    if (extensionSettings?.theme === 'dark') return 'dark'
    return systemTheme
  }, [extensionSettings?.theme, systemTheme])

  const checkRunner = useCallback(async () => {
    setRunnerStatus('checking')
    try {
      const settings = await getSettings()
      setExtensionSettings(settings)
      const baseUrl = settings.runnerBaseUrl.replace(/\/$/, '')
      setRunnerUrl(baseUrl)

      const health = await runnerClient.health()
      setRunnerStatus(health.status === 'ok' ? 'connected' : 'disconnected')
      setRunnerWarning(health.browserTarget?.warning ?? health.planner.warning ?? null)
      setRunnerDetails(
        health.browser?.browserConnected
          ? `${health.planner.provider}/${health.planner.model ?? 'default'} · ${health.browserTarget?.mode ?? 'launch'}${health.browser.activePageUrl ? ` on ${safeHostname(health.browser.activePageUrl)}` : ''}`
          : `${health.planner.provider}/${health.planner.model ?? 'default'} · ${health.browserTarget?.mode ?? 'launch'}`
      )
    } catch {
      setRunnerStatus('disconnected')
      setRunnerDetails(null)
      setRunnerWarning(null)
    }
  }, [])

  useEffect(() => {
    void getSettings().then(setExtensionSettings)

    const media = window.matchMedia('(prefers-color-scheme: light)')
    const updateTheme = () => setSystemTheme(media.matches ? 'light' : 'dark')
    updateTheme()
    media.addEventListener('change', updateTheme)

    return () => media.removeEventListener('change', updateTheme)
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
          if (
            chrome.runtime.lastError ||
            !response ||
            response.error ||
            typeof response.timestamp !== 'number'
          ) {
            setPageAccessMessage(
              chrome.runtime.lastError?.message ??
                response?.error ??
                'The assistant could not inspect this tab. Try a normal website instead of a browser-internal page.'
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
      if (runnerStatus !== 'connected') return

      setTab('tasks')
      setMenuOpen(false)

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

      await submitTask(prompt, observation, extensionSettings?.defaultMode ?? 'standard')
    },
    [collectPage, extensionSettings?.defaultMode, runnerStatus, submitTask]
  )

  const handleRerun = useCallback(
    (prompt: string) => {
      reset()
      setTab('tasks')
      setMenuOpen(false)
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

  const themeVars = resolvedTheme === 'light' ? lightThemeVars : darkThemeVars
  const currentTabMeta = NAV_ITEMS.find((item) => item.id === tab) ?? NAV_ITEMS[0]
  const topBanner = runnerStatus === 'disconnected'
    ? `Runner offline at ${runnerUrl}. Start it with pnpm runner:dev.`
    : runnerWarning ?? pageAccessMessage

  return (
    <div
      style={{
        ...themeVars,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          background: 'var(--header-bg)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #bfdbfe, #2563eb 62%, #0f172a)',
              boxShadow: '0 0 0 6px rgba(37,99,235,0.10)',
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>Browser Operator</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentTabMeta.label} · {currentTabMeta.description}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tab === 'tasks' && isRunning && (
            <button onClick={() => void cancel()} style={dangerButtonStyle}>
              Cancel
            </button>
          )}

          <button
            onClick={() => void checkRunner()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            title="Check runner connection"
          >
            <StatusBadge status={runnerStatus} />
          </button>

          <button
            onClick={() => setMenuOpen((open) => !open)}
            style={menuButtonStyle}
            title="Open menu"
          >
            <HamburgerIcon />
          </button>
        </div>
      </div>

      {runnerStatus === 'connected' && runnerDetails && (
        <div
          style={{
            padding: '8px 14px 0',
            fontSize: 11,
            color: 'var(--muted)',
            flexShrink: 0,
          }}
        >
          {runnerDetails}
        </div>
      )}

      {topBanner && (
        <Banner tone={runnerStatus === 'disconnected' ? 'danger' : 'warning'}>
          {topBanner}
        </Banner>
      )}

      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.22)',
                zIndex: 20,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                width: 280,
                maxWidth: 'calc(100% - 20px)',
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                boxShadow: 'var(--shadow)',
                zIndex: 21,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Menu</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Theme: {extensionSettings?.theme ?? 'system'} · Browser: {runnerDetails ?? 'checking...'}
                </div>
              </div>

              <div style={{ padding: 8 }}>
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setTab(item.id)
                      setMenuOpen(false)
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: item.id === tab ? 'var(--panel-soft)' : 'transparent',
                      border: '1px solid transparent',
                      borderRadius: 14,
                      padding: '10px 11px',
                      cursor: 'pointer',
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.description}</div>
                  </button>
                ))}
              </div>

              <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8 }}>
                {(['system', 'dark', 'light'] as const).map((themeOption) => (
                  <button
                    key={themeOption}
                    onClick={async () => {
                      const next = { ...(extensionSettings ?? (await getSettings())), theme: themeOption }
                      setExtensionSettings(next)
                      await saveSettings(next)
                      setMenuOpen(false)
                    }}
                    style={{
                      flex: 1,
                      background: extensionSettings?.theme === themeOption ? 'var(--panel-soft)' : 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      color: 'var(--text)',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '8px 0',
                      cursor: 'pointer',
                    }}
                  >
                    {capitalize(themeOption)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div
          style={{
            height: '100%',
            overflowY: 'auto',
            padding: 14,
          }}
        >
          {tab === 'tasks' && (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                {hasResult && <LiveTaskView state={state} />}

                {state.status === 'error' && state.taskId && (
                  <button onClick={() => void retryStream()} style={secondaryButtonStyle}>
                    Retry stream
                  </button>
                )}

                {state.status === 'error' && !state.taskId && state.prompt && (
                  <button onClick={() => void handleSubmit(state.prompt)} style={secondaryButtonStyle}>
                    Try again
                  </button>
                )}

                {!hasResult && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      paddingTop: 2,
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Try one of these</div>
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
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          borderRadius: 14,
                          color: 'var(--text-soft)',
                          fontSize: 12,
                          padding: '11px 12px',
                          cursor: isRunning || runnerStatus !== 'connected' ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          boxShadow: 'var(--shadow-soft)',
                        }}
                      >
                        {examplePrompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  position: 'sticky',
                  bottom: -14,
                  margin: '0 -14px -14px',
                  padding: '14px',
                  background: 'linear-gradient(180deg, transparent 0%, var(--bg) 16%, var(--bg) 100%)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <TaskInput onSubmit={handleSubmit} disabled={isRunning || runnerStatus !== 'connected'} />
              </div>
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

          {tab === 'settings' && (
            <SettingsPanel
              settings={extensionSettings}
              onSettingsChange={setExtensionSettings}
            />
          )}
        </div>
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
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.38; } }
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.15; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        * { box-sizing: border-box; }
        button, input, textarea, select { font: inherit; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 999px; }
      `}</style>
    </div>
  )
}

function Banner({ tone, children }: { tone: 'danger' | 'warning'; children: ReactNode }) {
  const palette =
    tone === 'danger'
      ? { bg: 'var(--danger-bg)', border: 'var(--danger-border)', color: 'var(--danger)' }
      : { bg: 'var(--warning-bg)', border: 'var(--warning-border)', color: 'var(--warning)' }

  return (
    <div
      style={{
        background: palette.bg,
        padding: '7px 14px',
        fontSize: 11,
        color: palette.color,
        borderBottom: `1px solid ${palette.border}`,
        flexShrink: 0,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  )
}

function HamburgerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 4.5h10" />
      <path d="M3 8h10" />
      <path d="M3 11.5h10" />
    </svg>
  )
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
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

const menuButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--text)',
  cursor: 'pointer',
}

const secondaryButtonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  color: 'var(--text)',
  fontSize: 11,
  padding: '8px 12px',
  cursor: 'pointer',
}

const dangerButtonStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--danger-border)',
  borderRadius: 999,
  color: 'var(--danger)',
  fontSize: 11,
  padding: '5px 10px',
  cursor: 'pointer',
}

const darkThemeVars: CSSProperties = {
  ['--bg' as string]: '#0b0d10',
  ['--header-bg' as string]: 'rgba(11,13,16,0.94)',
  ['--panel' as string]: '#111317',
  ['--panel-soft' as string]: '#141920',
  ['--surface' as string]: '#0f1216',
  ['--border' as string]: '#1f252d',
  ['--text' as string]: '#eef2f7',
  ['--text-soft' as string]: '#cbd5e1',
  ['--muted' as string]: '#7b8794',
  ['--shadow' as string]: '0 18px 44px rgba(0,0,0,0.28)',
  ['--shadow-soft' as string]: '0 10px 24px rgba(0,0,0,0.14)',
  ['--scrollbar' as string]: '#1f242c',
  ['--danger' as string]: '#f87171',
  ['--danger-bg' as string]: '#140809',
  ['--danger-border' as string]: '#3c191b',
  ['--warning' as string]: '#fbbf24',
  ['--warning-bg' as string]: '#171102',
  ['--warning-border' as string]: '#3f3110',
}

const lightThemeVars: CSSProperties = {
  ['--bg' as string]: '#f5f7fb',
  ['--header-bg' as string]: 'rgba(245,247,251,0.94)',
  ['--panel' as string]: '#ffffff',
  ['--panel-soft' as string]: '#f3f6fb',
  ['--surface' as string]: '#f8fafc',
  ['--border' as string]: '#d8e0ea',
  ['--text' as string]: '#0f172a',
  ['--text-soft' as string]: '#334155',
  ['--muted' as string]: '#64748b',
  ['--shadow' as string]: '0 18px 44px rgba(15,23,42,0.10)',
  ['--shadow-soft' as string]: '0 10px 24px rgba(15,23,42,0.06)',
  ['--scrollbar' as string]: '#c9d4e1',
  ['--danger' as string]: '#dc2626',
  ['--danger-bg' as string]: '#fff1f2',
  ['--danger-border' as string]: '#fecdd3',
  ['--warning' as string]: '#b45309',
  ['--warning-bg' as string]: '#fffbeb',
  ['--warning-border' as string]: '#fde68a',
}
