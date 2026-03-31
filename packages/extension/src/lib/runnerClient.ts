/**
 * Type-safe HTTP client for the runner API.
 * Reads baseUrl from settings. All methods are async/fetch-based.
 */
import type {
  TaskRequest,
  TaskResult,
  ImportantInfoExtraction,
  PageObservation,
  PlannerProviderConfigInput,
  PlannerProviderConfigPublic,
} from '@browser-automation/shared'
import { getSettings } from './storage.js'

async function getBase(): Promise<string> {
  const settings = await getSettings()
  return settings.runnerBaseUrl.replace(/\/$/, '')
}

export type RunnerHealth = {
  status: string
  planner: PlannerProviderConfigPublic
  version: string
  browser?: {
    browserConnected: boolean
    contextOpen: boolean
    pageOpen: boolean
    pageCount: number
    activePageUrl: string | null
  }
}

export const runnerClient = {
  async health(): Promise<RunnerHealth> {
    const base = await getBase()
    const r = await fetch(`${base}/health`)
    if (!r.ok) throw new Error(`Runner health check failed at ${base}: ${r.status}`)
    return r.json()
  },

  async getTask(taskId: string): Promise<TaskResult | { taskId: string; plan: TaskResult['plan'] }> {
    const base = await getBase()
    const r = await fetch(`${base}/task/${taskId}`)
    if (!r.ok) throw new Error(`Task lookup failed at ${base}: ${r.status}`)
    return r.json()
  },

  async submitTask(task: Omit<TaskRequest, never>): Promise<{ taskId: string; plan: TaskResult['plan'] }> {
    const base = await getBase()
    const r = await fetch(`${base}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }))
      throw new Error(err.error ?? `Task submission failed at ${base}: ${r.status}`)
    }
    return r.json()
  },

  streamUrl(taskId: string, base: string): string {
    return `${base}/task/${taskId}/stream`
  },

  async approve(taskId: string, stepIndex: number, approved: boolean): Promise<void> {
    const base = await getBase()
    const r = await fetch(`${base}/task/${taskId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, stepIndex, approved }),
    })
    if (!r.ok) throw new Error(`Approval failed at ${base}: ${r.status}`)
  },

  async cancel(taskId: string): Promise<void> {
    const base = await getBase()
    await fetch(`${base}/task/${taskId}/cancel`, { method: 'POST' }).catch(() => {})
  },

  async extractInfo(observation: PageObservation): Promise<ImportantInfoExtraction> {
    const base = await getBase()
    const r = await fetch(`${base}/assist/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observation }),
    })
    if (!r.ok) throw new Error(`Extraction failed at ${base}: ${r.status}`)
    return r.json()
  },

  async getPlannerSettings(): Promise<PlannerProviderConfigPublic> {
    const base = await getBase()
    const r = await fetch(`${base}/settings/planner`)
    if (!r.ok) throw new Error(`Planner settings lookup failed at ${base}: ${r.status}`)
    const data = (await r.json()) as { planner: PlannerProviderConfigPublic }
    return data.planner
  },

  async savePlannerSettings(settings: PlannerProviderConfigInput): Promise<PlannerProviderConfigPublic> {
    const base = await getBase()
    const r = await fetch(`${base}/settings/planner`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }))
      throw new Error(err.error ?? `Planner settings save failed at ${base}: ${r.status}`)
    }
    const data = (await r.json()) as { planner: PlannerProviderConfigPublic }
    return data.planner
  },

  async clearPlannerSecret(): Promise<PlannerProviderConfigPublic> {
    const base = await getBase()
    const r = await fetch(`${base}/settings/planner/secret`, {
      method: 'DELETE',
    })
    if (!r.ok) throw new Error(`Clear secret failed at ${base}: ${r.status}`)
    const data = (await r.json()) as { planner: PlannerProviderConfigPublic }
    return data.planner
  },
}
