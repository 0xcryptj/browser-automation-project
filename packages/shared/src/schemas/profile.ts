import { z } from 'zod'

// ── User Profile (for Assist Mode / form filling) ─────────────────────────────

export const WorkEntry = z.object({
  company: z.string(),
  title: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
})

export const EducationEntry = z.object({
  institution: z.string(),
  degree: z.string().optional(),
  field: z.string().optional(),
  graduationYear: z.string().optional(),
})

export const UserProfile = z.object({
  // Contact
  fullName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  address: z.string().optional(),

  // Online presence
  linkedIn: z.string().url().optional(),
  github: z.string().url().optional(),
  portfolio: z.string().url().optional(),
  website: z.string().url().optional(),

  // Resume / bio
  resumeText: z.string().optional(),
  summary: z.string().optional(),

  // Work history
  workHistory: z.array(WorkEntry).default([]),

  // Education
  education: z.array(EducationEntry).default([]),

  // Skills
  skills: z.array(z.string()).default([]),

  // Job preferences
  availability: z.string().optional(),
  willingToRelocate: z.boolean().optional(),
  requiresSponsorship: z.boolean().optional(),
  salaryExpectation: z.string().optional(),
  preferredWorkStyle: z.enum(['remote', 'hybrid', 'onsite', 'flexible']).optional(),
})
export type UserProfile = z.infer<typeof UserProfile>

// ── Extension Settings ────────────────────────────────────────────────────────

export const ExtensionSettings = z.object({
  runnerBaseUrl: z.string().url().default('http://localhost:3000'),
  defaultMode: z.enum(['standard', 'assist']).default('standard'),
  autoObserveOnOpen: z.boolean().default(false),
  showObservationDebug: z.boolean().default(false),
  maxHistoryEntries: z.number().int().min(1).max(200).default(50),
})
export type ExtensionSettings = z.infer<typeof ExtensionSettings>

export const DEFAULT_SETTINGS: ExtensionSettings = {
  runnerBaseUrl: 'http://localhost:3000',
  defaultMode: 'standard',
  autoObserveOnOpen: false,
  showObservationDebug: false,
  maxHistoryEntries: 50,
}

// ── Task History Entry ────────────────────────────────────────────────────────

export const HistoryEntry = z.object({
  id: z.string(),
  prompt: z.string(),
  status: z.string(),
  stepCount: z.number(),
  durationMs: z.number().optional(),
  timestamp: z.number(),
  url: z.string().optional(),
})
export type HistoryEntry = z.infer<typeof HistoryEntry>

// ── Important Info Extraction (Assist Mode) ───────────────────────────────────

export const ImportantDate = z.object({
  label: z.string(),
  date: z.string().optional(),
  rawText: z.string(),
  context: z.string().optional(),
})
export type ImportantDate = z.infer<typeof ImportantDate>

export const ImportantInfoExtraction = z.object({
  pageCategory: z.enum(['general', 'job_application', 'event', 'deadline']).default('general'),
  isJobApplicationPage: z.boolean().default(false),
  jobApplicationSignals: z.array(z.string()).default([]),
  deadlines: z.array(ImportantDate).default([]),
  dueDates: z.array(ImportantDate).default([]),
  applicationDates: z.array(ImportantDate).default([]),
  eventTimes: z.array(ImportantDate).default([]),
  warnings: z.array(z.string()).default([]),
  requiredMaterials: z.array(z.string()).default([]),
  nextActions: z.array(z.string()).default([]),
  missingRequirements: z.array(z.string()).default([]),
  callsToAction: z.array(z.string()).default([]),
  summary: z.string(),
  rawUrl: z.string().optional(),
  extractedAt: z.number().default(() => Date.now()),
})
export type ImportantInfoExtraction = z.infer<typeof ImportantInfoExtraction>

// ── Planner & Runner Config (for shared reference) ────────────────────────────

export const PlannerConfig = z.object({
  provider: z.enum(['mock', 'anthropic', 'openai']).default('mock'),
  model: z.string().optional(),
  maxSteps: z.number().int().min(1).max(30).default(15),
})
export type PlannerConfig = z.infer<typeof PlannerConfig>

export const RunnerConfig = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().int().default(3000),
  headless: z.boolean().default(false),
  slowMo: z.number().int().default(60),
  planner: PlannerConfig.default({}),
})
export type RunnerConfig = z.infer<typeof RunnerConfig>
