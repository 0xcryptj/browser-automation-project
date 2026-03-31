import { z } from 'zod'
import { Action } from './action.ts'

export const TaskEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('connected'), taskId: z.string() }),
  z.object({ type: z.literal('task_started'), taskId: z.string(), prompt: z.string() }),
  z.object({
    type: z.literal('plan_created'),
    taskId: z.string(),
    stepCount: z.number(),
    summary: z.string().optional(),
  }),
  z.object({
    type: z.literal('step_started'),
    taskId: z.string(),
    stepIndex: z.number(),
    actionType: z.string(),
    description: z.string(),
  }),
  z.object({
    type: z.literal('step_succeeded'),
    taskId: z.string(),
    stepIndex: z.number(),
    result: z.string().optional(),
    hasScreenshot: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('step_failed'),
    taskId: z.string(),
    stepIndex: z.number(),
    error: z.string(),
  }),
  z.object({
    type: z.literal('approval_required'),
    taskId: z.string(),
    stepIndex: z.number(),
    action: Action,
  }),
  z.object({
    type: z.literal('task_completed'),
    taskId: z.string(),
    status: z.string(),
    durationMs: z.number(),
  }),
  z.object({ type: z.literal('task_error'), taskId: z.string(), error: z.string() }),
])

export type TaskEvent = z.infer<typeof TaskEvent>
