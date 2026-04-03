import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { getDefaultObservationOptions } from '@browser-automation/shared'
import type { ExtensionSettings, ObservationOptions, PageObservation } from '@browser-automation/shared'
import { useTaskStream } from './hooks/useTaskStream.js'
import { TaskInput } from './components/TaskInput.js'
import { LiveTaskView } from './components/LiveTaskView.js'
import { ApprovalModal } from './components/ApprovalModal.js'
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
  { id: 'tasks', label: 'Tasks', description: 'Automate and ask questions.' },
  { id: 'assist', label: 'Assist', description: 'Page insights and next steps.' },
  { id: 'observe', label: 'Observe', description: 'Page snapshot.' },
  { id: 'history', label: 'History', description: 'Recent tasks.' },
  { id: 'settings', label: 'Settings', description: 'Connection and provider.' },
]

const EXAMPLE_PROMPTS = [
  'Summarize this page',
  'Fill out this form',
  'Go to example.com',
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
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          background: 'var(--header-bg)',
          backdropFilter: 'blur(20px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button
            onClick={() => void checkRunner()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
            title={runnerStatus}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: runnerStatus === 'connected' ? '#34d399' : runnerStatus === 'checking' ? '#94a3b8' : '#ef4444',
                flexShrink: 0,
                animation: runnerStatus === 'checking' ? 'pulse 1.4s ease-in-out infinite' : undefined,
              }}
            />
          </button>
          {activeTab?.faviconUrl && (
            <img
              src={activeTab.faviconUrl}
              alt=""
              style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeTab?.hostname || 'AutoAssist'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
              title={isQuizCollapsed ? 'Expand' : 'Collapse'}
            >
              {isQuizCollapsed ? <ExpandIcon /> : <CollapseIcon />}
            </button>
          )}

          {tab === 'tasks' && isRunning && (
            <button onClick={() => void cancel()} style={dangerButtonStyle}>
              Stop
            </button>
          )}

          <button
            onClick={() => setMenuOpen((open) => !open)}
            style={menuButtonStyle}
            title="Menu"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-haspopup="true"
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
              onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}
              role="button"
              tabIndex={-1}
              aria-label="Close menu"
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.22)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
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
                borderRadius: 12,
                boxShadow: 'var(--shadow)',
                zIndex: 21,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                  {activeTab?.hostname || 'AutoAssist'}
                </div>
              </div>

              <nav role="menu" style={{ padding: 8 }}>
                {visibleNavItems.map((item) => (
                  <button
                    key={item.id}
                    role="menuitem"
                    onClick={() => {
                      setTab(item.id)
                      setMenuOpen(false)
                    }}
                    aria-current={item.id === tab ? 'page' : undefined}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: item.id === tab ? 'var(--panel-soft)' : 'transparent',
                      border: `1px solid ${item.id === tab ? 'var(--border)' : 'transparent'}`,
                      borderRadius: 8,
                      padding: '10px 11px',
                      cursor: 'pointer',
                      marginBottom: 4,
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.description}</div>
                  </button>
                ))}
              </nav>

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
            overflowY: 'auto',
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
                          gap: 16,
                          padding: '28px 10px 14px',
                          minHeight: 240,
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
                            {isQuizMode ? 'Quiz mode' : 'What can I help with?'}
                          </div>
                          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--muted)' }}>
                            {isQuizMode
                              ? 'Discreet assistance while you practice.'
                              : 'Read, click, type, and automate in your browser.'}
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
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                color: 'var(--text-soft)',
                                fontSize: 12,
                                padding: '8px 12px',
                                cursor: isRunning || runnerStatus !== 'connected' ? 'not-allowed' : 'pointer',
                                textAlign: 'left',
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
                  padding: '10px 14px 14px',
                  borderTop: '1px solid var(--border)',
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
        gap: 12,
        padding: '14px',
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 12,
      } as React.CSSProperties}
    >
      {runnerStarting ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LoadingPulse />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Starting...</div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
            {isSetupNeeded ? 'Setup required' : 'Offline'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {isSetupNeeded
              ? 'Run the setup command, then try again.'
              : 'Runner not detected.'}
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
          padding: '14px 12px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
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
                ? 'Thinking...'
                : state.status === 'streaming'
                  ? 'Working...'
                  : 'Ask a question.')}
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
  width: 30,
  height: 30,
  background: 'var(--glass-button)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--muted)',
  cursor: 'pointer',
}

const secondaryButtonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  background: 'var(--glass-button)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 12,
  padding: '7px 12px',
  cursor: 'pointer',
}

const primaryPillStyle: CSSProperties = {
  background: 'var(--button-grad)',
  border: 'none',
  borderRadius: 8,
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 16px',
  cursor: 'pointer',
}

const dangerButtonStyle: CSSProperties = {
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-border)',
  borderRadius: 8,
  color: 'var(--danger)',
  fontSize: 12,
  fontWeight: 500,
  padding: '4px 10px',
  cursor: 'pointer',
}

const darkThemeVars: CSSProperties = {
  ['--bg' as string]: '#000000',
  ['--header-bg' as string]: 'rgba(0,0,0,0.72)',
  ['--panel' as string]: 'rgba(28,28,30,0.80)',
  ['--panel-soft' as string]: 'rgba(44,44,46,0.60)',
  ['--surface' as string]: 'rgba(28,28,30,0.90)',
  ['--border' as string]: 'rgba(255,255,255,0.08)',
  ['--glass-border' as string]: 'rgba(255,255,255,0.10)',
  ['--glass-button' as string]: 'rgba(255,255,255,0.06)',
  ['--button-grad' as string]: 'linear-gradient(180deg, #0a84ff 0%, #0070e0 100%)',
  ['--text' as string]: '#f5f5f7',
  ['--text-soft' as string]: '#a1a1a6',
  ['--muted' as string]: '#6e6e73',
  ['--shadow' as string]: '0 4px 16px rgba(0,0,0,0.40)',
  ['--shadow-soft' as string]: '0 2px 8px rgba(0,0,0,0.20)',
  ['--glass-shadow-soft' as string]: '0 1px 4px rgba(0,0,0,0.12)',
  ['--scrollbar' as string]: '#2c2c2e',
  ['--danger' as string]: '#ff453a',
  ['--danger-bg' as string]: 'rgba(255,69,58,0.12)',
  ['--danger-border' as string]: 'rgba(255,69,58,0.20)',
  ['--warning' as string]: '#ffd60a',
  ['--warning-bg' as string]: 'rgba(255,214,10,0.10)',
  ['--warning-border' as string]: 'rgba(255,214,10,0.18)',
  ['--glass-blur' as string]: 'blur(20px) saturate(1.8)',
}

const lightThemeVars: CSSProperties = {
  ['--bg' as string]: '#f5f5f7',
  ['--header-bg' as string]: 'rgba(245,245,247,0.72)',
  ['--panel' as string]: 'rgba(255,255,255,0.80)',
  ['--panel-soft' as string]: 'rgba(242,242,247,0.80)',
  ['--surface' as string]: 'rgba(255,255,255,0.90)',
  ['--border' as string]: 'rgba(0,0,0,0.06)',
  ['--glass-border' as string]: 'rgba(0,0,0,0.08)',
  ['--glass-button' as string]: 'rgba(0,0,0,0.03)',
  ['--button-grad' as string]: 'linear-gradient(180deg, #007aff 0%, #0066d6 100%)',
  ['--text' as string]: '#1d1d1f',
  ['--text-soft' as string]: '#424245',
  ['--muted' as string]: '#86868b',
  ['--shadow' as string]: '0 4px 16px rgba(0,0,0,0.08)',
  ['--shadow-soft' as string]: '0 2px 8px rgba(0,0,0,0.05)',
  ['--glass-shadow-soft' as string]: '0 1px 4px rgba(0,0,0,0.04)',
  ['--scrollbar' as string]: '#d1d1d6',
  ['--danger' as string]: '#ff3b30',
  ['--danger-bg' as string]: 'rgba(255,59,48,0.08)',
  ['--danger-border' as string]: 'rgba(255,59,48,0.16)',
  ['--warning' as string]: '#ff9500',
  ['--warning-bg' as string]: 'rgba(255,149,0,0.08)',
  ['--warning-border' as string]: 'rgba(255,149,0,0.16)',
  ['--glass-blur' as string]: 'blur(20px) saturate(1.8)',
}


