import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type {
  BrowserConnectionConfigInput,
  BrowserConnectionConfigPublic,
  ExtensionSettings,
  PlannerProviderConfigInput,
  PlannerProviderConfigPublic,
  UserProfile,
} from '@browser-automation/shared'
import { DEFAULT_BROWSER_CDP_URL, DEFAULT_OLLAMA_BASE_URL } from '@browser-automation/shared'
import { runnerClient } from '../../lib/runnerClient.js'
import { getProfile, getSettings, saveProfile, saveSettings } from '../../lib/storage.js'

type SettingsTab = 'runner' | 'provider' | 'profile'

const PROVIDER_OPTIONS: Array<{
  value: PlannerProviderConfigInput['provider']
  label: string
  help: string
}> = [
  { value: 'mock', label: 'Mock', help: 'Fast local fallback for testing the workflow.' },
  { value: 'openai', label: 'OpenAI', help: 'Uses an OpenAI API key stored locally by the runner.' },
  { value: 'anthropic', label: 'Anthropic', help: 'Uses an Anthropic API key stored locally by the runner.' },
  { value: 'ollama', label: 'Ollama', help: 'Uses a local Ollama endpoint such as http://127.0.0.1:11434.' },
]

export function SettingsPanel({
  settings: settingsProp,
  onSettingsChange,
}: {
  settings?: ExtensionSettings | null
  onSettingsChange?: (settings: ExtensionSettings) => void
}) {
  const [settings, setSettings] = useState<ExtensionSettings | null>(settingsProp ?? null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [planner, setPlanner] = useState<PlannerProviderConfigPublic | null>(null)
  const [browserSettings, setBrowserSettings] = useState<BrowserConnectionConfigPublic | null>(null)
  const [browserDraft, setBrowserDraft] = useState<BrowserConnectionConfigInput>({ mode: 'launch' })
  const [plannerDraft, setPlannerDraft] = useState<PlannerProviderConfigInput>({ provider: 'mock' })
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('runner')
  const [loadingPlanner, setLoadingPlanner] = useState(true)

  useEffect(() => {
    if (settingsProp) setSettings(settingsProp)
  }, [settingsProp])

  useEffect(() => {
    if (!settingsProp) {
      void getSettings().then(setSettings)
    }
    void getProfile().then(setProfile)
    void loadPlanner()
    void loadBrowserSettings()
  }, [settingsProp])

  const isProviderOffline = useMemo(() => !planner && !loadingPlanner, [planner, loadingPlanner])

  async function loadPlanner() {
    setLoadingPlanner(true)
    try {
      const nextPlanner = await runnerClient.getPlannerSettings()
      setPlanner(nextPlanner)
      setPlannerDraft({
        provider: nextPlanner.provider,
        model: nextPlanner.model,
        baseUrl: nextPlanner.baseUrl,
      })
      setError(null)
    } catch (err) {
      setPlanner(null)
      setError(err instanceof Error ? err.message : 'Runner settings are unavailable.')
    } finally {
      setLoadingPlanner(false)
    }
  }

  async function loadBrowserSettings() {
    try {
      const nextBrowser = await runnerClient.getBrowserSettings()
      setBrowserSettings(nextBrowser)
      setBrowserDraft({
        mode: nextBrowser.mode,
        cdpUrl: nextBrowser.cdpUrl,
      })
      setError(null)
    } catch (err) {
      setBrowserSettings(null)
      setError(err instanceof Error ? err.message : 'Runner browser settings are unavailable.')
    }
  }

  async function handleSettingsSave() {
    if (!settings) return
    await saveSettings(settings)
    onSettingsChange?.(settings)
    flashSaved('App settings saved')
  }

  async function handleBrowserSave() {
    try {
      const nextBrowser = await runnerClient.saveBrowserSettings(browserDraft)
      setBrowserSettings(nextBrowser)
      setBrowserDraft({
        mode: nextBrowser.mode,
        cdpUrl: nextBrowser.cdpUrl,
      })
      setError(null)
      flashSaved('Browser target saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Browser settings save failed.')
    }
  }

  async function handleProviderSave() {
    try {
      const nextPlanner = await runnerClient.savePlannerSettings(plannerDraft)
      setPlanner(nextPlanner)
      setPlannerDraft({
        provider: nextPlanner.provider,
        model: nextPlanner.model,
        baseUrl: nextPlanner.baseUrl,
      })
      setError(null)
      flashSaved('Provider settings saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provider settings save failed.')
    }
  }

  async function handleClearSecret() {
    try {
      const nextPlanner = await runnerClient.clearPlannerSecret()
      setPlanner(nextPlanner)
      setError(null)
      flashSaved('Stored API key cleared')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear stored API key.')
    }
  }

  async function handleProfileSave() {
    if (!profile) return
    await saveProfile(profile)
    flashSaved('Profile saved')
  }

  function flashSaved(message: string) {
    setSaved(message)
    setTimeout(() => setSaved(null), 1800)
  }

  if (!settings || !profile) {
    return <div style={{ padding: 16, color: 'var(--muted)', fontSize: 12 }}>Loading settings...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={tabRowStyle}>
        {(['runner', 'provider', 'profile'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...chipButtonStyle,
              background: activeTab === tab ? 'var(--panel-soft)' : 'var(--panel)',
              color: activeTab === tab ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {tab === 'profile' ? 'Profile' : capitalize(tab)}
          </button>
        ))}
      </div>

      {saved && <Callout tone="success">{saved}</Callout>}
      {error && <Callout tone="danger">{error}</Callout>}

      {activeTab === 'runner' && (
        <Section title="App and browser">
          <Field label="Runner URL" hint="Used by Chrome or Brave to connect to the local runner.">
            <input
              type="url"
              value={settings.runnerBaseUrl}
              onChange={(e) => {
                const next = { ...settings, runnerBaseUrl: e.target.value }
                setSettings(next)
                onSettingsChange?.(next)
              }}
              placeholder="http://localhost:3001"
              style={inputStyle}
            />
          </Field>

          <Field label="Theme">
            <select
              value={settings.theme}
              onChange={(e) => {
                const next = { ...settings, theme: e.target.value as ExtensionSettings['theme'] }
                setSettings(next)
                onSettingsChange?.(next)
              }}
              style={inputStyle}
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </Field>

          <Field label="Default Mode">
            <select
              value={settings.defaultMode}
              onChange={(e) => {
                const next = { ...settings, defaultMode: e.target.value as 'standard' | 'assist' }
                setSettings(next)
                onSettingsChange?.(next)
              }}
              style={inputStyle}
            >
              <option value="standard">Standard</option>
              <option value="assist">Assist</option>
            </select>
          </Field>

          <Toggle
            label="Show observation debug JSON"
            value={settings.showObservationDebug}
            onChange={(value) => {
              const next = { ...settings, showObservationDebug: value }
              setSettings(next)
              onSettingsChange?.(next)
            }}
          />

          <Field
            label="Browser Connection"
            hint="Attach mode lets the runner operate in your existing Brave or Chrome window instead of opening its own browser."
          >
            <select
              value={browserDraft.mode}
              onChange={(e) =>
                setBrowserDraft({
                  mode: e.target.value as BrowserConnectionConfigInput['mode'],
                  cdpUrl: e.target.value === 'attach' ? browserDraft.cdpUrl || DEFAULT_BROWSER_CDP_URL : undefined,
                })
              }
              style={inputStyle}
            >
              <option value="launch">Launch isolated browser</option>
              <option value="attach">Attach to Brave or Chrome</option>
            </select>
          </Field>

          {browserDraft.mode === 'attach' && (
            <Field
              label="CDP URL"
              hint="Start Brave or Chrome with --remote-debugging-port=9222, then point this to http://127.0.0.1:9222"
            >
              <input
                type="url"
                value={browserDraft.cdpUrl ?? ''}
                onChange={(e) =>
                  setBrowserDraft((current) => ({ ...current, cdpUrl: e.target.value || undefined }))
                }
                placeholder={DEFAULT_BROWSER_CDP_URL}
                style={inputStyle}
              />
            </Field>
          )}

          {browserSettings && (
            <InfoPanel>
              <div>Mode: {browserSettings.mode}</div>
              {browserSettings.cdpUrl && <div>CDP URL: {browserSettings.cdpUrl}</div>}
              <div>Ready: {browserSettings.ready ? 'Yes' : 'No'}</div>
              {browserSettings.warning && <div style={{ color: 'var(--warning)' }}>{browserSettings.warning}</div>}
            </InfoPanel>
          )}

          <div style={buttonRowStyle}>
            <button onClick={() => void handleBrowserSave()} style={secondaryButtonStyle}>
              Save Browser Target
            </button>
            <button onClick={() => void loadBrowserSettings()} style={secondaryButtonStyle}>
              Refresh Browser Status
            </button>
            <button onClick={() => void handleSettingsSave()} style={primaryButtonStyle}>
              Save App Settings
            </button>
          </div>
        </Section>
      )}

      {activeTab === 'provider' && (
        <Section title="Provider">
          <Callout tone="info">
            Provider credentials remain local to your machine. This extension never ships API keys in the bundle or manifest.
          </Callout>

          {loadingPlanner && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading provider settings...</div>}

          {isProviderOffline && (
            <Callout tone="warning">
              Provider settings come from the runner. Make sure the runner URL is correct and the runner is online.
            </Callout>
          )}

          {!loadingPlanner && (
            <>
              <Field label="Provider">
                <select
                  value={plannerDraft.provider}
                  onChange={(e) =>
                    setPlannerDraft((current) => ({
                      ...current,
                      provider: e.target.value as PlannerProviderConfigInput['provider'],
                      baseUrl: e.target.value === 'ollama' ? current.baseUrl || DEFAULT_OLLAMA_BASE_URL : undefined,
                    }))
                  }
                  style={inputStyle}
                >
                  {PROVIDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {PROVIDER_OPTIONS.find((option) => option.value === plannerDraft.provider)?.help}
              </div>

              <Field label="Model">
                <input
                  value={plannerDraft.model ?? ''}
                  onChange={(e) => setPlannerDraft((current) => ({ ...current, model: e.target.value || undefined }))}
                  placeholder={plannerDraft.provider === 'ollama' ? 'llama3.1' : 'model name'}
                  style={inputStyle}
                />
              </Field>

              {(plannerDraft.provider === 'ollama' || plannerDraft.provider === 'openai') && (
                <Field
                  label={plannerDraft.provider === 'ollama' ? 'Endpoint' : 'Base URL'}
                  hint={plannerDraft.provider === 'ollama' ? 'Default Ollama endpoint: http://127.0.0.1:11434' : 'Optional override for compatible API hosts.'}
                >
                  <input
                    type="url"
                    value={plannerDraft.baseUrl ?? ''}
                    onChange={(e) => setPlannerDraft((current) => ({ ...current, baseUrl: e.target.value || undefined }))}
                    placeholder={plannerDraft.provider === 'ollama' ? DEFAULT_OLLAMA_BASE_URL : 'https://api.openai.com/v1'}
                    style={inputStyle}
                  />
                </Field>
              )}

              {(plannerDraft.provider === 'openai' || plannerDraft.provider === 'anthropic') && (
                <Field label="API Key" hint="Stored only in the runner's local config file.">
                  <input
                    type="password"
                    value={plannerDraft.apiKey ?? ''}
                    onChange={(e) => setPlannerDraft((current) => ({ ...current, apiKey: e.target.value || undefined }))}
                    placeholder={planner?.hasApiKey ? `Saved: ${planner.apiKeyPreview}` : 'Paste API key'}
                    style={inputStyle}
                  />
                </Field>
              )}

              {planner && (
                <InfoPanel>
                  <div>Source: {planner.source}</div>
                  <div>Ready: {planner.ready ? 'Yes' : 'No'}</div>
                  {planner.configPath && <div>Local config: {planner.configPath}</div>}
                  {planner.apiKeyPreview && <div>Stored key: {planner.apiKeyPreview}</div>}
                  {planner.warning && <div style={{ color: 'var(--warning)' }}>{planner.warning}</div>}
                </InfoPanel>
              )}

              <div style={buttonRowStyle}>
                <button onClick={() => void handleProviderSave()} style={primaryButtonStyle}>
                  Save Provider Settings
                </button>
                {(planner?.hasApiKey ?? false) && (
                  <button onClick={() => void handleClearSecret()} style={secondaryButtonStyle}>
                    Clear Stored API Key
                  </button>
                )}
                <button onClick={() => void loadPlanner()} style={secondaryButtonStyle}>
                  Refresh Provider Status
                </button>
              </div>
            </>
          )}
        </Section>
      )}

      {activeTab === 'profile' && (
        <Section title="Profile">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="First Name">
              <input value={profile.firstName ?? ''} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Last Name">
              <input value={profile.lastName ?? ''} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} style={inputStyle} />
            </Field>
          </div>

          <Field label="Email">
            <input type="email" value={profile.email ?? ''} onChange={(e) => setProfile({ ...profile, email: e.target.value })} style={inputStyle} />
          </Field>

          <Field label="Phone">
            <input type="tel" value={profile.phone ?? ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} style={inputStyle} />
          </Field>

          <Field label="Location">
            <input value={profile.location ?? ''} onChange={(e) => setProfile({ ...profile, location: e.target.value })} style={inputStyle} placeholder="City, State" />
          </Field>

          <Field label="LinkedIn URL">
            <input type="url" value={profile.linkedIn ?? ''} onChange={(e) => setProfile({ ...profile, linkedIn: e.target.value })} style={inputStyle} />
          </Field>

          <Field label="GitHub URL">
            <input type="url" value={profile.github ?? ''} onChange={(e) => setProfile({ ...profile, github: e.target.value })} style={inputStyle} />
          </Field>

          <Field label="Skills">
            <input
              value={profile.skills.join(', ')}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  skills: e.target.value
                    .split(',')
                    .map((skill) => skill.trim())
                    .filter(Boolean),
                })
              }
              style={inputStyle}
              placeholder="TypeScript, React, Node.js"
            />
          </Field>

          <Field label="Professional Summary">
            <textarea
              value={profile.summary ?? ''}
              onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Brief bio for Assist Mode and form-filling context"
            />
          </Field>

          <button onClick={() => void handleProfileSave()} style={primaryButtonStyle}>
            Save Profile
          </button>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 14,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {children}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{hint}</span>}
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => onChange(!value)}>
      <div
        style={{
          width: 34,
          height: 20,
          borderRadius: 999,
          background: value ? '#2563eb' : 'var(--surface)',
          position: 'relative',
          flexShrink: 0,
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: value ? '#ffffff' : 'var(--muted)',
            transition: 'left 0.15s',
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>{label}</span>
    </div>
  )
}

function Callout({ tone, children }: { tone: 'success' | 'danger' | 'warning' | 'info'; children: React.ReactNode }) {
  const palette =
    tone === 'success'
      ? { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.18)', color: '#22c55e' }
      : tone === 'danger'
        ? { bg: 'var(--danger-bg)', border: 'var(--danger-border)', color: 'var(--danger)' }
        : tone === 'warning'
          ? { bg: 'var(--warning-bg)', border: 'var(--warning-border)', color: 'var(--warning)' }
          : { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.18)', color: '#60a5fa' }

  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 14,
        color: palette.color,
        fontSize: 12,
        lineHeight: 1.5,
        padding: '10px 12px',
      }}
    >
      {children}
    </div>
  )
}

function InfoPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        color: 'var(--text-soft)',
        fontSize: 11,
        lineHeight: 1.55,
        padding: '10px 12px',
        wordBreak: 'break-word',
      }}
    >
      {children}
    </div>
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const tabRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const chipButtonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  padding: '7px 10px',
  cursor: 'pointer',
}

const inputStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--text)',
  fontSize: 12,
  padding: '9px 10px',
  width: '100%',
  outline: 'none',
  fontFamily: 'inherit',
}

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const primaryButtonStyle: CSSProperties = {
  background: '#2563eb',
  border: 'none',
  borderRadius: 999,
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 600,
  padding: '9px 14px',
  cursor: 'pointer',
}

const secondaryButtonStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  color: 'var(--text)',
  fontSize: 12,
  fontWeight: 600,
  padding: '9px 14px',
  cursor: 'pointer',
}
