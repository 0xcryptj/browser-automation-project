import { useEffect, useMemo, useState } from 'react'
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
  { value: 'mock', label: 'Mock', help: 'Fast local fallback for testing task flow.' },
  { value: 'openai', label: 'OpenAI', help: 'Uses an OpenAI API key stored locally by the runner.' },
  { value: 'anthropic', label: 'Anthropic', help: 'Uses an Anthropic API key stored locally by the runner.' },
  { value: 'ollama', label: 'Ollama', help: 'Uses a local Ollama endpoint such as http://127.0.0.1:11434.' },
]

export function SettingsPanel() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [planner, setPlanner] = useState<PlannerProviderConfigPublic | null>(null)
  const [browserSettings, setBrowserSettings] = useState<BrowserConnectionConfigPublic | null>(null)
  const [browserDraft, setBrowserDraft] = useState<BrowserConnectionConfigInput>({
    mode: 'launch',
  })
  const [plannerDraft, setPlannerDraft] = useState<PlannerProviderConfigInput>({
    provider: 'mock',
  })
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('runner')
  const [loadingPlanner, setLoadingPlanner] = useState(true)

  useEffect(() => {
    void getSettings().then(setSettings)
    void getProfile().then(setProfile)
    void loadPlanner()
    void loadBrowserSettings()
  }, [])

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
    flashSaved('Runner settings saved')
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
      flashSaved('Browser target settings saved locally')
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
      flashSaved('Provider settings saved locally')
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
    return <div style={{ padding: 16, color: '#64748b', fontSize: 12 }}>Loading...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #1e1e2e', marginBottom: 14 }}>
        {(['runner', 'provider', 'profile'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
              color: activeTab === tab ? '#e2e8f0' : '#64748b',
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 12px',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'profile' ? 'My Profile' : tab}
          </button>
        ))}
      </div>

      {saved && (
        <div style={savedBannerStyle}>
          {saved}
        </div>
      )}

      {error && (
        <div style={errorBannerStyle}>
          {error}
        </div>
      )}

      {activeTab === 'runner' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Runner URL" hint="Used by Chrome or Brave to connect to the local runner.">
            <input
              type="url"
              value={settings.runnerBaseUrl}
              onChange={(e) => setSettings({ ...settings, runnerBaseUrl: e.target.value })}
              placeholder="http://localhost:3001"
              style={inputStyle}
            />
          </Field>

          <Field label="Default Mode">
            <select
              value={settings.defaultMode}
              onChange={(e) =>
                setSettings({ ...settings, defaultMode: e.target.value as 'standard' | 'assist' })
              }
              style={inputStyle}
            >
              <option value="standard">Standard</option>
              <option value="assist">Assist</option>
            </select>
          </Field>

          <Toggle
            label="Show observation debug JSON"
            value={settings.showObservationDebug}
            onChange={(value) => setSettings({ ...settings, showObservationDebug: value })}
          />

          <div style={metaCardStyle}>
            <div style={{ marginBottom: 8, color: '#cbd5e1', fontWeight: 600 }}>Browser Target</div>

            <Field
              label="Connection Mode"
              hint="Attach mode lets the runner operate in your existing Brave or Chrome window instead of opening a separate Playwright browser."
            >
              <select
                value={browserDraft.mode}
                onChange={(e) =>
                  setBrowserDraft({
                    mode: e.target.value as BrowserConnectionConfigInput['mode'],
                    cdpUrl:
                      e.target.value === 'attach'
                        ? browserDraft.cdpUrl || DEFAULT_BROWSER_CDP_URL
                        : undefined,
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
                hint="Example: brave.exe --remote-debugging-port=9222, then point this to http://127.0.0.1:9222"
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
              <div style={{ ...infoCardStyle, marginTop: 10 }}>
                <div>Mode: {browserSettings.mode}</div>
                {browserSettings.cdpUrl && <div>CDP URL: {browserSettings.cdpUrl}</div>}
                <div>Ready: {browserSettings.ready ? 'Yes' : 'No'}</div>
                {browserSettings.warning && <div style={{ color: '#fbbf24', marginTop: 4 }}>{browserSettings.warning}</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button onClick={() => void handleBrowserSave()} style={secondaryButtonStyle}>
                Save Browser Target
              </button>
              <button onClick={() => void loadBrowserSettings()} style={secondaryButtonStyle}>
                Refresh Browser Status
              </button>
            </div>
          </div>

          <button onClick={() => void handleSettingsSave()} style={saveButtonStyle}>
            Save Runner Settings
          </button>
        </div>
      )}

      {activeTab === 'provider' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={infoCardStyle}>
            Provider credentials remain local to your machine. This extension never ships API keys in the bundle or manifest.
          </div>

          {loadingPlanner && <div style={{ color: '#64748b', fontSize: 12 }}>Loading provider settings...</div>}

          {isProviderOffline && (
            <div style={warningCardStyle}>
              Provider settings come from the runner. Make sure the runner URL is correct and the runner is online.
            </div>
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
                      baseUrl:
                        e.target.value === 'ollama'
                          ? current.baseUrl || DEFAULT_OLLAMA_BASE_URL
                          : undefined,
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

              <div style={{ fontSize: 11, color: '#64748b' }}>
                {PROVIDER_OPTIONS.find((option) => option.value === plannerDraft.provider)?.help}
              </div>

              <Field label="Model">
                <input
                  value={plannerDraft.model ?? ''}
                  onChange={(e) =>
                    setPlannerDraft((current) => ({ ...current, model: e.target.value || undefined }))
                  }
                  placeholder={plannerDraft.provider === 'ollama' ? 'llama3.1' : 'model name'}
                  style={inputStyle}
                />
              </Field>

              {(plannerDraft.provider === 'ollama' || plannerDraft.provider === 'openai') && (
                <Field
                  label={plannerDraft.provider === 'ollama' ? 'Local Endpoint' : 'Base URL'}
                  hint={plannerDraft.provider === 'ollama' ? 'Default Ollama endpoint: http://127.0.0.1:11434' : 'Optional override for compatible API hosts.'}
                >
                  <input
                    type="url"
                    value={plannerDraft.baseUrl ?? ''}
                    onChange={(e) =>
                      setPlannerDraft((current) => ({ ...current, baseUrl: e.target.value || undefined }))
                    }
                    placeholder={
                      plannerDraft.provider === 'ollama'
                        ? DEFAULT_OLLAMA_BASE_URL
                        : 'https://api.openai.com/v1'
                    }
                    style={inputStyle}
                  />
                </Field>
              )}

              {(plannerDraft.provider === 'openai' || plannerDraft.provider === 'anthropic') && (
                <Field label="API Key" hint="Stored only in the runner's local config file.">
                  <input
                    type="password"
                    value={plannerDraft.apiKey ?? ''}
                    onChange={(e) =>
                      setPlannerDraft((current) => ({ ...current, apiKey: e.target.value || undefined }))
                    }
                    placeholder={planner?.hasApiKey ? `Saved: ${planner.apiKeyPreview}` : 'Paste API key'}
                    style={inputStyle}
                  />
                </Field>
              )}

              {planner && (
                <div style={metaCardStyle}>
                  <div>Source: {planner.source}</div>
                  <div>Ready: {planner.ready ? 'Yes' : 'No'}</div>
                  {planner.configPath && <div>Local config: {planner.configPath}</div>}
                  {planner.apiKeyPreview && <div>Stored key: {planner.apiKeyPreview}</div>}
                  {planner.warning && <div style={{ color: '#f59e0b' }}>{planner.warning}</div>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => void handleProviderSave()} style={saveButtonStyle}>
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
        </div>
      )}

      {activeTab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="First Name">
              <input
                value={profile.firstName ?? ''}
                onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                style={inputStyle}
              />
            </Field>
            <Field label="Last Name">
              <input
                value={profile.lastName ?? ''}
                onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Email">
            <input
              type="email"
              value={profile.email ?? ''}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              style={inputStyle}
            />
          </Field>

          <Field label="Phone">
            <input
              type="tel"
              value={profile.phone ?? ''}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              style={inputStyle}
            />
          </Field>

          <Field label="Location">
            <input
              value={profile.location ?? ''}
              onChange={(e) => setProfile({ ...profile, location: e.target.value })}
              style={inputStyle}
              placeholder="City, State"
            />
          </Field>

          <Field label="LinkedIn URL">
            <input
              type="url"
              value={profile.linkedIn ?? ''}
              onChange={(e) => setProfile({ ...profile, linkedIn: e.target.value })}
              style={inputStyle}
            />
          </Field>

          <Field label="GitHub URL">
            <input
              type="url"
              value={profile.github ?? ''}
              onChange={(e) => setProfile({ ...profile, github: e.target.value })}
              style={inputStyle}
            />
          </Field>

          <Field label="Skills (comma-separated)">
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

          <button onClick={() => void handleProfileSave()} style={saveButtonStyle}>
            Save Profile
          </button>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 10, color: '#475569' }}>{hint}</span>}
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
      onClick={() => onChange(!value)}
    >
      <div
        style={{
          width: 28,
          height: 16,
          borderRadius: 8,
          background: value ? '#6366f1' : '#1e2040',
          position: 'relative',
          flexShrink: 0,
          border: `1px solid ${value ? '#6366f1' : '#313150'}`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 12 : 2,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: value ? '#fff' : '#475569',
            transition: 'left 0.15s',
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#1e1e2e',
  border: '1px solid #313150',
  borderRadius: 6,
  color: '#e2e8f0',
  fontSize: 12,
  padding: '6px 8px',
  width: '100%',
  outline: 'none',
  fontFamily: 'inherit',
}

const saveButtonStyle: React.CSSProperties = {
  background: '#6366f1',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  padding: '8px 16px',
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  background: '#1e1e2e',
  border: '1px solid #313150',
  borderRadius: 6,
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 600,
  padding: '8px 16px',
  cursor: 'pointer',
}

const infoCardStyle: React.CSSProperties = {
  background: '#08130d',
  border: '1px solid #22c55e22',
  borderRadius: 8,
  color: '#86efac',
  fontSize: 11,
  lineHeight: 1.45,
  padding: '10px 12px',
}

const warningCardStyle: React.CSSProperties = {
  background: '#1a1500',
  border: '1px solid #f59e0b22',
  borderRadius: 8,
  color: '#fbbf24',
  fontSize: 11,
  lineHeight: 1.45,
  padding: '10px 12px',
}

const metaCardStyle: React.CSSProperties = {
  background: '#121220',
  border: '1px solid #1e1e2e',
  borderRadius: 8,
  color: '#94a3b8',
  fontSize: 11,
  lineHeight: 1.45,
  padding: '10px 12px',
  wordBreak: 'break-word',
}

const savedBannerStyle: React.CSSProperties = {
  background: '#08130d',
  border: '1px solid #22c55e22',
  borderRadius: 8,
  color: '#86efac',
  fontSize: 11,
  marginBottom: 12,
  padding: '8px 10px',
}

const errorBannerStyle: React.CSSProperties = {
  background: '#1a0a0a',
  border: '1px solid #ef444433',
  borderRadius: 8,
  color: '#fca5a5',
  fontSize: 11,
  marginBottom: 12,
  padding: '8px 10px',
}
