import { z } from 'zod'
import { Action } from './action.ts'

export const TaskEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('connected'), taskId: z.string() }),
  z.object({ type: z.literal('task_started'), taskId: z.string(), prompt: z.string(), mode: z.string().optional() }),
  z.object({
    type: z.literal('plan_created'),
    taskId: z.string(),
    stepCount: z.number(),
    summary: z.string().optional(),
    plannerUsed: z.string().optional(),
  }),
  z.object({
    type: z.literal('step_started'),
    taskId: z.string(),
    stepIndex: z.number(),
    actionType: z.string(),
    description: z.string(),
    selector: z.string().optional(),
    elementRef: z.string().optional(),
    targetLabel: z.string().optional(),
    pageUrl: z.string().optional(),
  }),
  z.object({
    type: z.literal('step_succeeded'),
    taskId: z.string(),
    stepIndex: z.number(),
    result: z.string().optional(),
    hasScreenshot: z.boolean().default(false),
    durationMs: z.number().optional(),
  }),
  z.object({
    type: z.literal('step_failed'),
    taskId: z.string(),
    stepIndex: z.number(),
    error: z.string(),
    retrying: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('approval_required'),
    taskId: z.string(),
    stepIndex: z.number(),
    action: Action,
    pageUrl: z.string().optional(),
  }),
  z.object({
    type: z.literal('task_completed'),
    taskId: z.string(),
    status: z.literal('done'),
    durationMs: z.number(),
    stepsDone: z.number().optional(),
    stepsFailed: z.number().optional(),
  }),
  z.object({
    type: z.literal('task_failed'),
    taskId: z.string(),
    error: z.string(),
    durationMs: z.number().optional(),
    stepsDone: z.number().optional(),
    stepsFailed: z.number().optional(),
  }),
  z.object({
    type: z.literal('task_cancelled'),
    taskId: z.string(),
    stepIndex: z.number().optional(),
    reason: z.string().optional(),
    durationMs: z.number().optional(),
  }),
])
export type TaskEvent = z.infer<typeof TaskEvent>
