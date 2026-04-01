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
type ActiveTabInfo = {
  title: string
  url: string
  hostname: string
  faviconUrl: string | null
}

const NAV_ITEMS: Array<{ id: Tab; label: string; description: string }> = [
  { id: 'tasks', label: 'Tasks', description: 'Run browser actions and ask follow-up questions.' },
  { id: 'assist', label: 'Assist', description: 'Summaries, dates, warnings, and next steps.' },
  { id: 'observe', label: 'Observe', description: 'Inspect the current page snapshot and refs.' },
  { id: 'history', label: 'History', description: 'Rerun or review recent tasks.' },
  { id: 'settings', label: 'Settings', description: 'Runner, browser target, provider, and profile.' },
]

const EXAMPLE_PROMPTS = [
  'Draft a professional email reply',
  'Create a project timeline from my notes',
  'Summarize this page and tell me the next steps',
]

export default function App() {
  const [tab, setTab] = useState<Tab>('tasks')
  const [menuOpen, setMenuOpen] = useState(false)
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>('checking')
  const [runnerUrl, setRunnerUrl] = useState('http://localhost:3000')
  const [runnerHealth, setRunnerHealth] = useState<Awaited<ReturnType<typeof runnerClient.health>> | null>(null)
  const [extensionSettings, setExtensionSettings] = useState<ExtensionSettings | null>(null)
  const [pageObservation, setPageObservation] = useState<PageObservation | null>(null)
  const [observeLoading, setObserveLoading] = useState(false)
  const [pageAccessMessage, setPageAccessMessage] = useState<string | null>(null)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('dark')
  const [runnerStarting, setRunnerStarting] = useState(false)
  const [launcherError, setLauncherError] = useState<string | null>(null)
  const [launcherHelperCommand, setLauncherHelperCommand] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTabInfo | null>(null)
  const { state, submitTask, approve, cancel, reset, retryStream } = useTaskStream()
  const prevStatus = useRef(state.status)
  const lastAutoStartAttemptAt = useRef(0)
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
      setLauncherError(null)
      setLauncherHelperCommand(null)
    } catch {
      setRunnerHealth(null)
      setRunnerStatus('disconnected')
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
    const refreshActiveTab = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const title = (tab?.title ?? '').trim()
        const url = (tab?.url ?? '').trim()
        setActiveTab({
          title: title || 'Current page',
          url,
          hostname: safeHostname(url),
          faviconUrl: tab?.favIconUrl ?? null,
        })
      } catch {
        setActiveTab(null)
      }
    }

    const handleActivated = () => {
      void refreshActiveTab()
    }

    const handleUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && (typeof changeInfo.title === 'string' || typeof changeInfo.url === 'string' || typeof changeInfo.favIconUrl === 'string' || changeInfo.status === 'complete')) {
        void refreshActiveTab()
      }
    }

    void refreshActiveTab()
    chrome.tabs.onActivated.addListener(handleActivated)
    chrome.tabs.onUpdated.addListener(handleUpdated)

    return () => {
      chrome.tabs.onActivated.removeListener(handleActivated)
      chrome.tabs.onUpdated.removeListener(handleUpdated)
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
    if (extensionSettings === null || !extensionSettings.autoStartRunner) {
      return
    }

    if (runnerStatus !== 'disconnected' || runnerStarting) {
      return
    }

    const elapsed = Date.now() - lastAutoStartAttemptAt.current
    const waitMs = Math.max(0, 8000 - elapsed)
    const timeoutId = window.setTimeout(() => {
      lastAutoStartAttemptAt.current = Date.now()
      void ensureLocalRunner()
    }, waitMs)

    return () => window.clearTimeout(timeoutId)
  }, [ensureLocalRunner, extensionSettings, runnerStarting, runnerStatus])

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

  const collectPage = useCallback(async (
    mode: 'task' | 'observe' = 'observe',
    behavior?: { quietOnFailure?: boolean }
  ): Promise<PageObservation | null> => {
    setObserveLoading(true)
    try {
      const observationOptions: ObservationOptions = getDefaultObservationOptions(mode)
      const observation = await new Promise<PageObservation | null>((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTEXT', options: observationOptions }, (response) => {
          if (
            chrome.runtime.lastError ||
            !response ||
            response.error ||
            typeof response.timestamp !== 'number'
          ) {
            if (!behavior?.quietOnFailure) {
              setPageAccessMessage(
                chrome.runtime.lastError?.message ??
                  response?.error ??
                  'The assistant could not inspect this tab. Try a normal website instead of a browser-internal page.'
              )
            }
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
      const requiresContext = needsCurrentPageContext(prompt)

      let observation: PageObservation | null = null
      try {
        observation = await collectPage('task', { quietOnFailure: !requiresContext })
      } catch {
        observation = null
      }

      if (!observation && requiresContext) {
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
  const showRunnerRecoveryCard = runnerStatus !== 'connected' || runnerStarting || Boolean(launcherError)
  const topBanner = showRunnerRecoveryCard ? null : pageAccessMessage
  const showTaskResult =
    hasResult &&
    !(
      showRunnerRecoveryCard &&
      (state.status === 'idle' ||
        state.status === 'error' ||
        state.status === 'submitting' ||
        state.status === 'planning')
    )
  const orbState =
    runnerStatus !== 'connected'
      ? 'offline'
      : runnerHealth?.browserTarget?.mode === 'attach' && runnerHealth.browserTarget.activeMode === 'attach'
        ? 'attached'
        : runnerHealth?.browserTarget?.mode === 'attach' && runnerHealth.browserTarget.activeMode === 'launch'
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
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, ui-sans-serif, system-ui, sans-serif',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--glass-border)',
          flexShrink: 0,
          background: 'var(--header-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {activeTab?.faviconUrl ? (
            <img
              src={activeTab.faviconUrl}
              alt=""
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: 'var(--panel-soft)',
                border: '1px solid var(--glass-border)',
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeTab?.title || 'Browser Operator'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeTab?.hostname || 'Ready'}
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
                backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
              }}
            >
              <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Menu</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {`${activeTab?.title || 'Current page'} · ${runnerStatus === 'connected' ? 'Connected' : runnerStatus === 'disconnected' ? 'Offline' : 'Checking'}`}
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
                    {showTaskResult && <LiveTaskView state={state} />}

                    {showRunnerRecoveryCard && (
                      <ConnectionCard
                        runnerUrl={runnerUrl}
                        runnerStarting={runnerStarting}
                        launcherError={launcherError}
                        helperCommand={launcherHelperCommand}
                        onStart={() => void ensureLocalRunner()}
                      />
                    )}

                    {!showRunnerRecoveryCard && state.status === 'error' && state.taskId && (
                      <button onClick={() => void retryStream()} style={secondaryButtonStyle}>
                        Retry stream
                      </button>
                    )}

                    {!showRunnerRecoveryCard && state.status === 'error' && !state.taskId && state.prompt && (
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
                            gap: 10,
                            textAlign: 'center',
                            maxWidth: 340,
                          }}
                        >
                          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.03em' }}>
                            {isQuizMode ? 'Quiz mode' : 'Ask anything'}
                          </div>
                          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--muted)' }}>
                            {isQuizMode
                              ? 'Keep the panel discreet while you practice. Ask for hints, quick explanations, or short page summaries.'
                              : 'Use it like a strong everyday assistant, or have it handle grounded browser tasks on the page you are on.'}
                          </div>
                        </div>

                        {!isQuizMode && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                            {EXAMPLE_PROMPTS.map((examplePrompt) => (
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
                  backdropFilter: 'var(--glass-blur)',
                  WebkitBackdropFilter: 'var(--glass-blur)',
                  borderTop: '1px solid color-mix(in srgb, var(--glass-border) 70%, transparent)',
                }}
              >
                <TaskInput
                  onSubmit={handleSubmit}
                  disabled={runnerStarting || isRunning || runnerStatus !== 'connected'}
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
  runnerUrl: _runnerUrl,
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
  const [showCommand, setShowCommand] = useState(false)
  const isSetupNeeded = Boolean(
    launcherError?.toLowerCase().includes('not found') ||
    launcherError?.toLowerCase().includes('native messaging')
  )

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
        gap: 14,
        padding: '18px 16px',
        background: 'var(--panel)',
        border: '1px solid var(--glass-border)',
        borderRadius: 24,
        boxShadow: 'var(--shadow-soft)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
      } as React.CSSProperties}
    >
      {runnerStarting ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LoadingPulse />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              Starting up
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Your assistant is getting ready
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em', marginBottom: 4 }}>
            {isSetupNeeded ? 'Setup required' : 'Not connected'}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--muted)' }}>
            {isSetupNeeded
              ? 'A one-time setup is needed to enable automatic startup. Run the setup command in your project folder, then click Try again.'
              : "Your local assistant isn't running yet. Click Connect to start it."}
          </div>
        </div>
      )}

      {launcherError && !isSetupNeeded && (
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

      {isSetupNeeded && helperCommand && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={() => setShowCommand((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--muted)',
              fontSize: 11,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 8, opacity: 0.7 }}>{showCommand ? '▼' : '▶'}</span>
            {showCommand ? 'Hide' : 'Show'} setup command
          </button>
          {showCommand && (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 12px',
                fontSize: 10,
                color: 'var(--text-soft)',
                lineHeight: 1.6,
                wordBreak: 'break-all',
                fontFamily: '"SF Mono", "Fira Code", Menlo, monospace',
              }}
            >
              {helperCommand}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onStart} disabled={runnerStarting} style={primaryPillStyle}>
          {runnerStarting ? 'Starting...' : isSetupNeeded ? 'Try again' : 'Connect'}
        </button>
        {isSetupNeeded && helperCommand && (
          <button onClick={() => void copyCommand()} style={secondaryButtonStyle}>
            {copied ? 'Copied' : 'Copy command'}
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
          backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
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

function LoadingPulse() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#60a5fa',
            opacity: 0.35,
            animation: `dotPulse 1.1s ease-in-out ${index * 0.12}s infinite`,
          }}
        />
      ))}
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
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
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
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
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
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
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
  ['--bg' as string]: '#08090f',
  ['--header-bg' as string]: 'rgba(10,11,18,0.82)',
  ['--panel' as string]: 'rgba(22,27,42,0.54)',
  ['--panel-soft' as string]: 'rgba(32,38,56,0.42)',
  ['--surface' as string]: 'rgba(15,18,30,0.68)',
  ['--border' as string]: 'rgba(255,255,255,0.08)',
  ['--glass-border' as string]: 'rgba(255,255,255,0.12)',
  ['--glass-button' as string]: 'rgba(255,255,255,0.08)',
  ['--button-grad' as string]: 'linear-gradient(160deg, rgba(140,185,255,0.98) 0%, rgba(65,125,255,0.88) 100%)',
  ['--text' as string]: '#f2f5fa',
  ['--text-soft' as string]: '#c4cdd9',
  ['--muted' as string]: '#636d7a',
  ['--shadow' as string]: '0 28px 64px rgba(0,0,0,0.32)',
  ['--shadow-soft' as string]: '0 18px 40px rgba(0,0,0,0.18)',
  ['--glass-shadow-soft' as string]: '0 12px 32px rgba(0,0,0,0.16)',
  ['--scrollbar' as string]: '#1a1f2b',
  ['--danger' as string]: '#ff6b6b',
  ['--danger-bg' as string]: 'rgba(80,14,20,0.32)',
  ['--danger-border' as string]: 'rgba(255,80,80,0.18)',
  ['--warning' as string]: '#fbbf24',
  ['--warning-bg' as string]: 'rgba(80,58,10,0.28)',
  ['--warning-border' as string]: 'rgba(251,191,36,0.18)',
  ['--glass-blur' as string]: 'blur(56px) saturate(2) brightness(1.02)',
}

const lightThemeVars: CSSProperties = {
  ['--bg' as string]: '#f2f4f8',
  ['--header-bg' as string]: 'rgba(248,250,255,0.82)',
  ['--panel' as string]: 'rgba(255,255,255,0.70)',
  ['--panel-soft' as string]: 'rgba(248,250,255,0.74)',
  ['--surface' as string]: 'rgba(255,255,255,0.80)',
  ['--border' as string]: 'rgba(0,0,0,0.07)',
  ['--glass-border' as string]: 'rgba(255,255,255,0.72)',
  ['--glass-button' as string]: 'rgba(255,255,255,0.65)',
  ['--button-grad' as string]: 'linear-gradient(160deg, rgba(90,150,255,0.96) 0%, rgba(50,115,255,0.84) 100%)',
  ['--text' as string]: '#0d1117',
  ['--text-soft' as string]: '#2d3748',
  ['--muted' as string]: '#6b7280',
  ['--shadow' as string]: '0 24px 56px rgba(0,0,0,0.10)',
  ['--shadow-soft' as string]: '0 16px 36px rgba(0,0,0,0.07)',
  ['--glass-shadow-soft' as string]: '0 10px 24px rgba(0,0,0,0.06)',
  ['--scrollbar' as string]: '#d1d8e0',
  ['--danger' as string]: '#e53e3e',
  ['--danger-bg' as string]: 'rgba(255,235,236,0.88)',
  ['--danger-border' as string]: 'rgba(229,62,62,0.22)',
  ['--warning' as string]: '#b7791f',
  ['--warning-bg' as string]: 'rgba(255,248,230,0.90)',
  ['--warning-border' as string]: 'rgba(183,121,31,0.24)',
  ['--glass-blur' as string]: 'blur(56px) saturate(1.8) brightness(1.01)',
}

function formatRunnerDetails(health: Awaited<ReturnType<typeof runnerClient.health>>) {
  if (health.status !== 'ok') {
    return 'Offline'
  }

  return 'Connected'
}
