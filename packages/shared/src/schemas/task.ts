import { z } from 'zod'
import { Action } from './action.ts'
import { CompactPageSnapshot, PageObservation } from './observation.ts'

// ── Inbound request ───────────────────────────────────────────────────────────

export const TaskRequest = z.object({
  id: z.string(),
  prompt: z.string().min(1).max(4000),
  mode: z.enum(['standard', 'assist']).default('standard'),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'Only http/https URLs are allowed',
    })
    .optional(),
  title: z.string().optional(),
  observation: PageObservation.optional(),
})
export type TaskRequest = z.infer<typeof TaskRequest>

// ── Plan ──────────────────────────────────────────────────────────────────────

export const StepStatus = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'awaiting_approval',
  'skipped',
])
export type StepStatus = z.infer<typeof StepStatus>

export const ActionStep = z.object({
  step: z.number().int().nonnegative(),
  action: Action,
  status: StepStatus.default('pending'),
  result: z.string().optional(),
  error: z.string().optional(),
  screenshot: z.string().optional(), // base64 after execution
  durationMs: z.number().optional(),
})
export type ActionStep = z.infer<typeof ActionStep>

export const PlannedActionStep = z.object({
  step: z.number().int().nonnegative(),
  action: Action,
  status: z.literal('pending').default('pending'),
})
export type PlannedActionStep = z.infer<typeof PlannedActionStep>

export const ActionPlan = z.object({
  summary: z.string().optional(),
  steps: z.array(PlannedActionStep).min(1),
})
export type ActionPlan = z.infer<typeof ActionPlan>

export const TaskContext = z.object({
  url: z.string().url().optional(),
  title: z.string().optional(),
  snapshot: CompactPageSnapshot.optional(),
  text: z.string().optional(),
  headings: z.array(z.string()).optional(),
  textBlocks: z.array(z.string()).optional(),
})
export type TaskContext = z.infer<typeof TaskContext>

export const TaskPlan = z.object({
  id: z.string(),
  prompt: z.string(),
  steps: z.array(ActionStep),
  context: TaskContext.optional(),
  status: z.enum(['planned', 'running', 'done', 'failed', 'awaiting_approval', 'cancelled']),
  summary: z.string().optional(),
  plannerUsed: z.string().optional(), // e.g. 'mock', 'anthropic/claude-opus-4-5'
  createdAt: z.number(),
})
export type TaskPlan = z.infer<typeof TaskPlan>

// ── Result ────────────────────────────────────────────────────────────────────

export const ActionResult = z.object({
  success: z.boolean(),
  value: z.string().optional(),
  screenshot: z.string().optional(),
  error: z.string().optional(),
  durationMs: z.number().optional(),
})
export type ActionResult = z.infer<typeof ActionResult>

export const TaskResult = z.object({
  taskId: z.string(),
  plan: TaskPlan,
  observation: PageObservation.optional(),
  extracted: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  durationMs: z.number().optional(),
})
export type TaskResult = z.infer<typeof TaskResult>

// ── Approval ──────────────────────────────────────────────────────────────────

export const ApprovalRequest = z.object({
  taskId: z.string(),
  stepIndex: z.number().int().nonnegative(),
  approved: z.boolean(),
})
export type ApprovalRequest = z.infer<typeof ApprovalRequest>

// ── User profile summary (compact form for planner context) ───────────────────

export const UserProfileSummary = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  skills: z.array(z.string()).optional(),
  summary: z.string().optional(),
})
export type UserProfileSummary = z.infer<typeof UserProfileSummary>
