import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { getDefaultObservationOptions } from '@browser-automation/shared'
import type { ExtensionSettings, ObservationOptions, PageObservation } from '@browser-automation/shared'
import { useTaskStream } from './hooks/useTaskStream.js'
import { TaskInput } from './components/TaskInput.js'
import { LiveTaskView } from './components/LiveTaskView.js'
import { ApprovalModal } from './components/ApprovalModal.js'
import { StatusBadge } from './components/StatusBadge.js'
import { FutureLoginScreen } from './components/FutureLoginScreen.js'
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
  const [runnerHealth, setRunnerHealth] = useState<Awaited<ReturnType<typeof runnerClient.health>> | null>(null)
  const [runnerDetails, setRunnerDetails] = useState<string | null>(null)
  const [runnerWarning, setRunnerWarning] = useState<string | null>(null)
  const [extensionSettings, setExtensionSettings] = useState<ExtensionSettings | null>(null)
  const [pageObservation, setPageObservation] = useState<PageObservation | null>(null)
  const [observeLoading, setObserveLoading] = useState(false)
  const [pageAccessMessage, setPageAccessMessage] = useState<string | null>(null)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('dark')
  const [runnerStarting, setRunnerStarting] = useState(false)
  const [launcherError, setLauncherError] = useState<string | null>(null)
  const [launcherHelperCommand, setLauncherHelperCommand] = useState<string | null>(null)
  const { state, submitTask, approve, cancel, reset, retryStream } = useTaskStream()
  const prevStatus = useRef(state.status)
  const attemptedAutoStart = useRef(false)
  const isQuizMode = extensionSettings?.quizModeEnabled ?? false
  const isQuizCollapsed = isQuizMode && (extensionSettings?.quizModeCollapsed ?? false)
  const visibleNavItems = isQuizMode
    ? NAV_ITEMS.filter((item) => item.id === 'tasks' || item.id === 'settings')
    : NAV_ITEMS

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
      setRunnerHealth(health)
      setRunnerStatus(health.status === 'ok' ? 'connected' : 'disconnected')
      const suppressFallbackWarning =
        health.browserTarget?.mode === 'attach' &&
        health.browserTarget.activeMode === 'launch'
      setRunnerWarning(suppressFallbackWarning ? null : health.browserTarget?.warning ?? health.planner.warning ?? null)
      setLauncherError(null)
      setLauncherHelperCommand(null)
      setRunnerDetails(formatRunnerDetails(health))
    } catch {
      setRunnerHealth(null)
      setRunnerStatus('disconnected')
      setRunnerDetails(null)
      setRunnerWarning(null)
    }
  }, [])

  const ensureLocalRunner = useCallback(async () => {
    setRunnerStarting(true)
    setLauncherError(null)

    const result = await runnerClient.ensureRunner()
    if (!result.ok) {
      setRunnerStatus('disconnected')
      setLauncherError(result.error)
      setLauncherHelperCommand(result.helperCommand ?? null)
      setRunnerStarting(false)
      return false
    }

    await checkRunner()
    setRunnerStarting(false)
    return true
  }, [checkRunner])

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
    if (attemptedAutoStart.current || extensionSettings === null) {
      return
    }

    if (!extensionSettings.autoStartRunner) {
      attemptedAutoStart.current = true
      return
    }

    if (runnerStatus !== 'disconnected') {
      return
    }

    attemptedAutoStart.current = true
    void ensureLocalRunner()
  }, [ensureLocalRunner, extensionSettings, runnerStatus])

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

  useEffect(() => {
    if (isQuizMode && tab !== 'tasks' && tab !== 'settings') {
      setTab('tasks')
    }
  }, [isQuizMode, tab])

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
      if (runnerStatus !== 'connected') {
        const booted = await ensureLocalRunner()
        if (!booted) return
      }

      if (runnerHealth?.browserTarget?.mode === 'attach' && !runnerHealth.browserTarget.ready) {
        setLauncherError(null)
      }

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
    [collectPage, ensureLocalRunner, extensionSettings?.defaultMode, runnerHealth, runnerStatus, submitTask]
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
  const currentTabMeta = visibleNavItems.find((item) => item.id === tab) ?? visibleNavItems[0] ?? NAV_ITEMS[0]
  const topBanner = runnerStatus === 'disconnected'
    ? null
    : runnerWarning ?? pageAccessMessage
  const orbState =
    runnerStatus !== 'connected'
      ? 'offline'
      : runnerHealth?.browserTarget?.mode === 'attach' && runnerHealth.browserTarget.activeMode === 'attach'
        ? 'attached'
        : runnerHealth?.browserTarget?.mode === 'attach' && runnerHealth.browserTarget.activeMode === 'launch'
          ? 'warning'
          : runnerWarning
          ? 'warning'
          : 'online'

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
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div style={auroraStyle('radial-gradient(circle at 30% 20%, rgba(88,132,255,0.24), rgba(88,132,255,0.02) 55%, transparent 72%)', -44, -30, 180, 180)} />
        <div style={auroraStyle('radial-gradient(circle at 70% 10%, rgba(110,231,255,0.14), rgba(110,231,255,0.02) 50%, transparent 70%)', 170, -24, 170, 170)} />
        <div style={auroraStyle('radial-gradient(circle at 50% 50%, rgba(255,255,255,0.08), rgba(255,255,255,0.01) 55%, transparent 72%)', 60, 330, 220, 220)} />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--glass-border)',
          flexShrink: 0,
          background: 'var(--header-bg)',
          backdropFilter: 'blur(22px) saturate(1.28)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              ...getOrbStyle(orbState),
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>Browser Operator</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {`${currentTabMeta.label} - ${currentTabMeta.description}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isQuizMode && (
            <button
              onClick={async () => {
                const next = {
                  ...(extensionSettings ?? (await getSettings())),
                  quizModeCollapsed: !isQuizCollapsed,
                }
                setExtensionSettings(next)
                await saveSettings(next)
              }}
              style={menuButtonStyle}
              title={isQuizCollapsed ? 'Expand quiz mode' : 'Collapse quiz mode'}
            >
              {isQuizCollapsed ? <ExpandIcon /> : <CollapseIcon />}
            </button>
          )}

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

      {runnerStatus === 'connected' && runnerDetails && !isQuizCollapsed && (
        <div style={{ padding: '8px 14px 0', flexShrink: 0 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 999,
              background: 'var(--glass-button)',
              border: '1px solid var(--glass-border)',
              backdropFilter: 'blur(16px) saturate(1.18)',
              boxShadow: 'var(--glass-shadow-soft)',
              fontSize: 11,
              color: 'var(--muted)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background:
                  orbState === 'attached'
                    ? '#34d399'
                    : orbState === 'warning'
                      ? '#fbbf24'
                      : '#60a5fa',
                boxShadow:
                  orbState === 'attached'
                    ? '0 0 0 4px rgba(52,211,153,0.12)'
                    : orbState === 'warning'
                      ? '0 0 0 4px rgba(251,191,36,0.12)'
                      : '0 0 0 4px rgba(96,165,250,0.12)',
              }}
            />
            {runnerDetails}
          </div>
        </div>
      )}

      {topBanner && !isQuizCollapsed && (
        <Banner tone={runnerStatus === 'disconnected' ? 'danger' : 'warning'}>
          {topBanner}
        </Banner>
      )}

      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1,
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
                border: '1px solid var(--glass-border)',
                borderRadius: 20,
                boxShadow: 'var(--shadow)',
                zIndex: 21,
                overflow: 'hidden',
                backdropFilter: 'blur(22px) saturate(1.28)',
              }}
            >
              <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Menu</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {`Theme: ${extensionSettings?.theme ?? 'system'} - Browser: ${runnerDetails ?? 'checking...'}`}
                </div>
              </div>

              <div style={{ padding: 8 }}>
                {visibleNavItems.map((item) => (
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

              {isQuizMode && (
                <div style={{ padding: '0 14px 10px' }}>
                  <button
                    onClick={async () => {
                      const next = {
                        ...(extensionSettings ?? (await getSettings())),
                        quizModeCollapsed: !isQuizCollapsed,
                      }
                      setExtensionSettings(next)
                      await saveSettings(next)
                      setMenuOpen(false)
                    }}
                    style={{
                      width: '100%',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      color: 'var(--text)',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '9px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {isQuizCollapsed ? 'Expand Quiz Mode' : 'Collapse Quiz Mode'}
                  </button>
                </div>
              )}

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
            overflow: 'hidden',
            padding: 14,
          }}
        >
          {tab === 'tasks' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
                {isQuizCollapsed ? (
                  <CompactQuizView
                    state={state}
                    runnerStatus={runnerStatus}
                    runnerStarting={runnerStarting}
                    launcherError={launcherError}
                    onRetry={() => void retryStream()}
                    onTryAgain={() => state.prompt && void handleSubmit(state.prompt)}
                  />
                ) : (
                  <>
                    {hasResult && <LiveTaskView state={state} />}

                    {(runnerStatus !== 'connected' || runnerStarting || launcherError) && (
                      <ConnectionCard
                        runnerUrl={runnerUrl}
                        runnerStarting={runnerStarting}
                        launcherError={launcherError}
                        helperCommand={launcherHelperCommand}
                        onStart={() => void ensureLocalRunner()}
                      />
                    )}

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

                    {!hasResult && runnerStatus === 'connected' && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 18,
                          padding: '36px 10px 18px',
                          minHeight: 320,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 12,
                            textAlign: 'center',
                            maxWidth: 320,
                          }}
                        >
                          <div
                            style={{
                              width: 64,
                              height: 64,
                              borderRadius: '50%',
                              background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9), rgba(115,168,255,0.84) 38%, rgba(32,77,187,0.78) 66%, rgba(7,18,41,0.82))',
                              boxShadow: '0 0 0 14px rgba(116,173,255,0.10), 0 18px 40px rgba(24,72,191,0.18)',
                            }}
                          />
                          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.03em' }}>
                            {isQuizMode ? 'Quiz mode' : 'Ask anything'}
                          </div>
                          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--muted)' }}>
                            {isQuizMode
                              ? 'Keep the panel discreet while you practice. Ask for hints, quick explanations, or short page summaries.'
                              : 'Read the page, click through flows, fill visible forms, or ask for a summary while the operator works in your browser.'}
                          </div>
                        </div>

                        {!isQuizMode && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                            {[
                            'Go to example.com',
                            'Extract the main heading',
                            'Tell me what I am viewing',
                            'Search for TypeScript on google.com',
                            'Take a screenshot of this page',
                          ].map((examplePrompt) => (
                            <button
                              key={examplePrompt}
                              onClick={() => void handleSubmit(examplePrompt)}
                              disabled={isRunning || runnerStatus !== 'connected'}
                              style={{
                                background: 'var(--panel)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: 999,
                                color: 'var(--text-soft)',
                                fontSize: 12,
                                padding: '9px 12px',
                                cursor: isRunning || runnerStatus !== 'connected' ? 'not-allowed' : 'pointer',
                                textAlign: 'left',
                                boxShadow: 'var(--glass-shadow-soft)',
                                backdropFilter: 'blur(16px) saturate(1.2)',
                              }}
                            >
                              {examplePrompt}
                            </button>
                          ))}
                        </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div
                style={{
                  flexShrink: 0,
                  margin: '0 -14px -14px',
                  padding: '14px',
                  paddingTop: 10,
                  background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, color-mix(in srgb, var(--bg) 72%, transparent) 16%, var(--bg) 100%)',
                  backdropFilter: 'blur(18px) saturate(1.15)',
                  borderTop: '1px solid color-mix(in srgb, var(--glass-border) 70%, transparent)',
                }}
              >
                <TaskInput
                  onSubmit={handleSubmit}
                  disabled={isRunning || runnerStatus !== 'connected'}
                  compact={isQuizCollapsed}
                />
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FutureLoginScreen />
              <SettingsPanel
                settings={extensionSettings}
                onSettingsChange={setExtensionSettings}
              />
            </div>
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

function ConnectionCard({
  runnerUrl,
  runnerStarting,
  launcherError,
  helperCommand,
  onStart,
}: {
  runnerUrl: string
  runnerStarting: boolean
  launcherError: string | null
  helperCommand: string | null
  onStart: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copyCommand = async () => {
    if (!helperCommand) return
    try {
      await navigator.clipboard.writeText(helperCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #bfdbfe, #2563eb 58%, #0f172a)',
            boxShadow: '0 0 0 8px rgba(37,99,235,0.08)',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            {runnerStarting ? 'Starting your local operator' : 'Your local operator is offline'}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--muted)' }}>
            {runnerStarting
              ? `Launching the local runner at ${runnerUrl}.`
              : `The extension is set to use ${runnerUrl}. Once the companion is installed, startup can happen automatically.`}
          </div>
        </div>
      </div>

      {launcherError && (
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            color: 'var(--warning)',
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning-border)',
            borderRadius: 14,
            padding: '10px 12px',
          }}
        >
          {launcherError}
        </div>
      )}

      {helperCommand && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '11px 12px',
            fontSize: 11,
            color: 'var(--text-soft)',
            lineHeight: 1.55,
            wordBreak: 'break-word',
          }}
        >
          <div style={{ marginBottom: 8, color: 'var(--muted)' }}>One-time setup command</div>
          <code>{helperCommand}</code>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onStart} disabled={runnerStarting} style={primaryPillStyle}>
          {runnerStarting ? 'Starting...' : 'Start local operator'}
        </button>
        {helperCommand && (
          <button onClick={() => void copyCommand()} style={secondaryButtonStyle}>
            {copied ? 'Copied' : 'Copy setup command'}
          </button>
        )}
      </div>
    </div>
  )
}

function CompactQuizView({
  state,
  runnerStatus,
  runnerStarting,
  launcherError,
  onRetry,
  onTryAgain,
}: {
  state: ReturnType<typeof useTaskStream>['state']
  runnerStatus: RunnerStatus
  runnerStarting: boolean
  launcherError: string | null
  onRetry: () => void
  onTryAgain: () => void
}) {
  const answer = state.steps
    .filter((step) => step.status === 'done' && step.result)
    .map((step) => step.result)
    .filter(Boolean)
    .slice(-1)[0]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 180,
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          padding: '16px 14px',
          background: 'var(--panel)',
          border: '1px solid var(--glass-border)',
          borderRadius: 22,
          boxShadow: 'var(--glass-shadow-soft)',
          backdropFilter: 'blur(20px) saturate(1.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: runnerStatus === 'connected' ? '#34d399' : runnerStarting ? '#60a5fa' : '#f59e0b',
              boxShadow: `0 0 0 6px ${
                runnerStatus === 'connected'
                  ? 'rgba(52,211,153,0.12)'
                  : runnerStarting
                    ? 'rgba(96,165,250,0.12)'
                    : 'rgba(245,158,11,0.12)'
              }`,
            }}
          />
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Quiz mode</div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.6 }}>
          {answer ||
            (launcherError
              ? launcherError
              : state.status === 'planning'
                ? 'Preparing a quick answer...'
                : state.status === 'streaming'
                  ? 'Working quietly in the background...'
                  : 'Ask for a hint, a short summary, or a quick explanation.')}
        </div>
      </div>

      {state.status === 'error' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {state.taskId ? (
            <button onClick={onRetry} style={secondaryButtonStyle}>
              Retry stream
            </button>
          ) : (
            <button onClick={onTryAgain} style={secondaryButtonStyle}>
              Try again
            </button>
          )}
        </div>
      )}
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

function CollapseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10" />
      <path d="m9.5 5.5 2.5 2.5-2.5 2.5" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10" />
      <path d="M6.5 5.5 4 8l2.5 2.5" />
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
  background: 'var(--glass-button)',
  border: '1px solid var(--glass-border)',
  borderRadius: 14,
  color: 'var(--text)',
  cursor: 'pointer',
  backdropFilter: 'blur(18px) saturate(1.25)',
  boxShadow: 'var(--glass-shadow-soft)',
}

const secondaryButtonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  background: 'var(--glass-button)',
  border: '1px solid var(--glass-border)',
  borderRadius: 999,
  color: 'var(--text)',
  fontSize: 11,
  padding: '8px 12px',
  cursor: 'pointer',
  backdropFilter: 'blur(18px) saturate(1.2)',
  boxShadow: 'var(--glass-shadow-soft)',
}

const primaryPillStyle: CSSProperties = {
  background: 'var(--button-grad)',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 999,
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 600,
  padding: '9px 14px',
  cursor: 'pointer',
  boxShadow: '0 14px 30px rgba(49,102,255,0.22), inset 0 1px 0 rgba(255,255,255,0.28)',
  backdropFilter: 'blur(18px) saturate(1.25)',
}

const dangerButtonStyle: CSSProperties = {
  background: 'color-mix(in srgb, var(--panel) 62%, transparent)',
  border: '1px solid var(--danger-border)',
  borderRadius: 999,
  color: 'var(--danger)',
  fontSize: 11,
  padding: '5px 10px',
  cursor: 'pointer',
  backdropFilter: 'blur(14px)',
}

const darkThemeVars: CSSProperties = {
  ['--bg' as string]: 'linear-gradient(180deg, rgb(9 12 20) 0%, rgb(10 15 24) 48%, rgb(7 10 18) 100%)',
  ['--header-bg' as string]: 'linear-gradient(180deg, rgba(14,20,33,0.76), rgba(13,17,28,0.62))',
  ['--panel' as string]: 'linear-gradient(180deg, rgba(24,31,46,0.62), rgba(14,18,27,0.48))',
  ['--panel-soft' as string]: 'linear-gradient(180deg, rgba(35,45,67,0.48), rgba(18,22,35,0.34))',
  ['--surface' as string]: 'linear-gradient(180deg, rgba(17,22,34,0.72), rgba(11,15,24,0.62))',
  ['--border' as string]: 'rgba(132,149,196,0.16)',
  ['--glass-border' as string]: 'rgba(255,255,255,0.12)',
  ['--glass-button' as string]: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
  ['--button-grad' as string]: 'linear-gradient(180deg, rgba(115,168,255,0.95), rgba(60,120,255,0.78))',
  ['--text' as string]: '#eef2f7',
  ['--text-soft' as string]: '#cbd5e1',
  ['--muted' as string]: '#7b8794',
  ['--shadow' as string]: '0 24px 60px rgba(0,0,0,0.24)',
  ['--shadow-soft' as string]: '0 16px 38px rgba(0,0,0,0.14)',
  ['--glass-shadow-soft' as string]: '0 10px 28px rgba(0,0,0,0.12)',
  ['--scrollbar' as string]: '#1f242c',
  ['--danger' as string]: '#f87171',
  ['--danger-bg' as string]: 'rgba(92,16,24,0.28)',
  ['--danger-border' as string]: '#3c191b',
  ['--warning' as string]: '#fbbf24',
  ['--warning-bg' as string]: 'rgba(86,62,12,0.24)',
  ['--warning-border' as string]: '#3f3110',
}

const lightThemeVars: CSSProperties = {
  ['--bg' as string]: 'linear-gradient(180deg, rgb(243 247 255) 0%, rgb(238 244 252) 42%, rgb(245 248 255) 100%)',
  ['--header-bg' as string]: 'linear-gradient(180deg, rgba(255,255,255,0.75), rgba(246,249,255,0.68))',
  ['--panel' as string]: 'linear-gradient(180deg, rgba(255,255,255,0.82), rgba(247,250,255,0.64))',
  ['--panel-soft' as string]: 'linear-gradient(180deg, rgba(255,255,255,0.78), rgba(238,244,255,0.6))',
  ['--surface' as string]: 'linear-gradient(180deg, rgba(255,255,255,0.76), rgba(244,248,255,0.68))',
  ['--border' as string]: 'rgba(148,163,184,0.18)',
  ['--glass-border' as string]: 'rgba(255,255,255,0.56)',
  ['--glass-button' as string]: 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.42))',
  ['--button-grad' as string]: 'linear-gradient(180deg, rgba(126,177,255,0.92), rgba(75,128,255,0.76))',
  ['--text' as string]: '#0f172a',
  ['--text-soft' as string]: '#334155',
  ['--muted' as string]: '#64748b',
  ['--shadow' as string]: '0 24px 54px rgba(15,23,42,0.10)',
  ['--shadow-soft' as string]: '0 16px 34px rgba(15,23,42,0.07)',
  ['--glass-shadow-soft' as string]: '0 10px 22px rgba(15,23,42,0.05)',
  ['--scrollbar' as string]: '#c9d4e1',
  ['--danger' as string]: '#dc2626',
  ['--danger-bg' as string]: 'rgba(255,241,242,0.78)',
  ['--danger-border' as string]: '#fecdd3',
  ['--warning' as string]: '#b45309',
  ['--warning-bg' as string]: 'rgba(255,251,235,0.84)',
  ['--warning-border' as string]: '#fde68a',
}

function auroraStyle(background: string, left: number, top: number, width: number, height: number): CSSProperties {
  return {
    position: 'absolute',
    left,
    top,
    width,
    height,
    borderRadius: '50%',
    background,
    filter: 'blur(28px)',
    opacity: 0.9,
  }
}

function getOrbStyle(state: 'offline' | 'warning' | 'online' | 'attached'): CSSProperties {
  if (state === 'attached') {
    return {
      background: 'radial-gradient(circle at 35% 35%, #d1fae5, #34d399 58%, #064e3b)',
      boxShadow: '0 0 0 6px rgba(52,211,153,0.12), 0 10px 24px rgba(16,185,129,0.18)',
    }
  }

  if (state === 'warning') {
    return {
      background: 'radial-gradient(circle at 35% 35%, #fef3c7, #f59e0b 58%, #78350f)',
      boxShadow: '0 0 0 6px rgba(245,158,11,0.12), 0 10px 24px rgba(245,158,11,0.18)',
    }
  }

  if (state === 'offline') {
    return {
      background: 'radial-gradient(circle at 35% 35%, #fecaca, #f87171 58%, #7f1d1d)',
      boxShadow: '0 0 0 6px rgba(248,113,113,0.10), 0 10px 24px rgba(127,29,29,0.16)',
    }
  }

  return {
    background: 'radial-gradient(circle at 35% 35%, #bfdbfe, #2563eb 62%, #0f172a)',
    boxShadow: '0 0 0 6px rgba(37,99,235,0.10), 0 10px 24px rgba(37,99,235,0.16)',
  }
}

function formatRunnerDetails(health: Awaited<ReturnType<typeof runnerClient.health>>) {
  const browserState =
    health.browserTarget?.mode === 'attach'
      ? health.browserTarget.activeMode === 'attach'
        ? 'Attached browser ready'
        : 'Attach unavailable - using isolated browser'
      : 'Launching isolated browser'
  const base = `${health.planner.provider}/${health.planner.model ?? 'default'} - ${browserState}`
  return health.browser?.browserConnected && health.browser.activePageUrl
    ? `${base} on ${safeHostname(health.browser.activePageUrl)}`
    : base
}
