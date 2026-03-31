import { z } from 'zod'
import { Action } from './action.ts'
import { PageObservation } from './observation.ts'

// ── Inbound ────────────────────────────────────────────────────────────────

export const TaskRequest = z.object({
  id: z.string(),
  prompt: z.string().min(1),
  url: z.string().url().optional(),
  title: z.string().optional(),
  observation: PageObservation.optional(),
})

export type TaskRequest = z.infer<typeof TaskRequest>

// ── Plan ──────────────────────────────────────────────────────────────────

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
})

export type ActionStep = z.infer<typeof ActionStep>

export const TaskPlan = z.object({
  id: z.string(),
  prompt: z.string(),
  steps: z.array(ActionStep),
  status: z.enum(['planned', 'running', 'done', 'failed', 'awaiting_approval']),
  summary: z.string().optional(),
  createdAt: z.number(),
})

export type TaskPlan = z.infer<typeof TaskPlan>

// ── Result ────────────────────────────────────────────────────────────────

export const TaskResult = z.object({
  taskId: z.string(),
  plan: TaskPlan,
  observation: PageObservation.optional(),
  extracted: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  durationMs: z.number().optional(),
})

export type TaskResult = z.infer<typeof TaskResult>

// ── Approval ──────────────────────────────────────────────────────────────

export const ApprovalRequest = z.object({
  taskId: z.string(),
  stepIndex: z.number().int().nonnegative(),
  approved: z.boolean(),
})

export type ApprovalRequest = z.infer<typeof ApprovalRequest>
