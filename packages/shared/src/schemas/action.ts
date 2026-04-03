import { z } from 'zod'

export const ActionType = z.enum([
  'goto',
  'click',
  'type',
  'select',
  'scroll',
  'hover',
  'pressKey',   // renamed from 'press' for clarity; 'press' kept as alias
  'press',      // legacy alias
  'wait_for_selector',
  'wait_for_text',
  'extract',
  'screenshot',
])

export type ActionType = z.infer<typeof ActionType>

/** Sensitivity level for an action — drives approval UI copy */
export const ActionSensitivity = z.enum([
  'none',
  'submit',    // form submission
  'delete',    // destructive delete / remove
  'payment',   // financial action
  'send',      // send / publish / post
])
export type ActionSensitivity = z.infer<typeof ActionSensitivity>

/** Keywords that automatically set requiresApproval: true */
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
  url: z.string().url().refine((u) => u.startsWith('http://') || u.startsWith('https://'), { message: 'Only http/https URLs are allowed' }).nullish(),

  // Element targeting
  elementRef: z.string().nullish(),
  selector: z.string().nullish(),

  // Input / value
  value: z.string().max(10000).nullish(),

  // Keyboard
  key: z.string().nullish(),

  // Scroll
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  amount: z.number().int().positive().optional(),

  // Metadata
  description: z.string(),
  requiresApproval: z.boolean().default(false),
  sensitivity: ActionSensitivity.default('none'),

  /** Why this step requires approval (shown in approval modal) */
  approvalReason: z.string().nullish(),
})

export type Action = z.infer<typeof Action>
