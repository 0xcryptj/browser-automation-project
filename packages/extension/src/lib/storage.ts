/**
 * Typed wrappers around chrome.storage.
 * - Settings → chrome.storage.sync (small, syncs across devices)
 * - Profile, History → chrome.storage.local (larger data)
 */
import type { ExtensionSettings, UserProfile, HistoryEntry } from '@browser-automation/shared'
import { ExtensionSettings as SettingsSchema, UserProfile as ProfileSchema, DEFAULT_SETTINGS } from '@browser-automation/shared'

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<ExtensionSettings> {
  try {
    const stored = await chrome.storage.sync.get('settings')
    if (stored.settings) {
      const parsed = SettingsSchema.safeParse(stored.settings)
      if (parsed.success) return parsed.data
    }
  } catch {}
  return DEFAULT_SETTINGS
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings()
  const merged = SettingsSchema.parse({ ...current, ...settings })
  try {
    await chrome.storage.sync.set({ settings: merged })
  } catch (err) {
    throw new Error(
      `Failed to save settings: ${
        err instanceof Error ? err.message : String(err)
      }. Check storage quota or extension permissions.`
    )
  }
}

// ── User Profile ──────────────────────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile> {
  try {
    const stored = await chrome.storage.local.get('profile')
    if (stored.profile) {
      const parsed = ProfileSchema.safeParse(stored.profile)
      if (parsed.success) return parsed.data
    }
  } catch {}
  return ProfileSchema.parse({})
}

export async function saveProfile(profile: Partial<UserProfile>): Promise<void> {
  const current = await getProfile()
  const merged = ProfileSchema.parse({ ...current, ...profile })
  try {
    await chrome.storage.local.set({ profile: merged })
  } catch (err) {
    throw new Error(
      `Failed to save profile: ${
        err instanceof Error ? err.message : String(err)
      }.`
    )
  }
}

// ── Task History ──────────────────────────────────────────────────────────────

export async function getHistory(): Promise<HistoryEntry[]> {
  try {
    const stored = await chrome.storage.local.get('taskHistory')
    if (Array.isArray(stored.taskHistory)) return stored.taskHistory as HistoryEntry[]
  } catch {}
  return []
}

export async function addHistoryEntry(entry: HistoryEntry, maxEntries = 50): Promise<void> {
  const history = await getHistory()
  const updated = [entry, ...history.filter((item) => item.id !== entry.id)].slice(0, maxEntries)
  try {
    await chrome.storage.local.set({ taskHistory: updated })
  } catch {
    // History writes are best-effort; a storage failure should not break task flow.
  }
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove('taskHistory')
}
