import { z } from 'zod'

export const BrowserConnectionMode = z.enum(['launch', 'attach'])
export type BrowserConnectionMode = z.infer<typeof BrowserConnectionMode>

export const BrowserConnectionConfigInput = z.object({
  mode: BrowserConnectionMode.default('launch'),
  cdpUrl: z.string().trim().url().optional(),
})
export type BrowserConnectionConfigInput = z.infer<typeof BrowserConnectionConfigInput>

export const BrowserConnectionConfigStored = z.object({
  mode: BrowserConnectionMode.default('launch'),
  cdpUrl: z.string().trim().url().optional(),
  updatedAt: z.number().optional(),
})
export type BrowserConnectionConfigStored = z.infer<typeof BrowserConnectionConfigStored>

export const BrowserConnectionConfigPublic = z.object({
  mode: BrowserConnectionMode.default('launch'),
  cdpUrl: z.string().optional(),
  source: z.enum(['default', 'env', 'local']).default('default'),
  ready: z.boolean().default(false),
  warning: z.string().optional(),
})
export type BrowserConnectionConfigPublic = z.infer<typeof BrowserConnectionConfigPublic>

export const DEFAULT_BROWSER_CDP_URL = 'http://127.0.0.1:9222'
