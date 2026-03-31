import { z } from 'zod'

export const ActionType = z.enum([
  'goto',
  'click',
  'type',
  'select',
  'scroll',
  'hover',
  'press',
  'wait_for_selector',
  'wait_for_text',
  'extract',
  'screenshot',
])

export type ActionType = z.infer<typeof ActionType>

// Actions that require explicit user approval before execution
export const SENSITIVE_ACTION_KEYWORDS = [
  'submit',
  'delete',
  'remove',
  'payment',
  'pay',
  'purchase',
  'buy',
  'send',
  'confirm',
  'checkout',
] as const

export const Action = z.object({
  type: ActionType,
  // Navigation
  url: z.string().url().optional(),
  // Element targeting
  selector: z.string().optional(),
  // Input / value
  value: z.string().optional(),
  // Keyboard
  key: z.string().optional(),
  // Scroll
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  amount: z.number().int().positive().optional(),
  // Metadata
  description: z.string(),
  requiresApproval: z.boolean().default(false),
})

export type Action = z.infer<typeof Action>
