import { z } from 'zod'

export const PlannerProvider = z.enum([
  'mock',
  'openai',
  'anthropic',
  'ollama',
  'groq',
  'moonshot',
])
export type PlannerProvider = z.infer<typeof PlannerProvider>

export const SupportedPlannerProvider = z.enum(['mock', 'openai', 'anthropic', 'ollama'])
export type SupportedPlannerProvider = z.infer<typeof SupportedPlannerProvider>

export const PlannerProviderConfigInput = z.object({
  provider: PlannerProvider.default('mock'),
  model: z.string().trim().min(1).max(200).optional(),
  baseUrl: z.string().trim().url().optional(),
  apiKey: z.string().trim().min(1).max(500).optional(),
})
export type PlannerProviderConfigInput = z.infer<typeof PlannerProviderConfigInput>

export const PlannerProviderConfigStored = z.object({
  provider: PlannerProvider.default('mock'),
  model: z.string().trim().min(1).max(200).optional(),
  baseUrl: z.string().trim().url().optional(),
  apiKey: z.string().trim().min(1).max(500).optional(),
  updatedAt: z.number().optional(),
})
export type PlannerProviderConfigStored = z.infer<typeof PlannerProviderConfigStored>

export const PlannerProviderConfigPublic = z.object({
  provider: PlannerProvider,
  model: z.string().optional(),
  baseUrl: z.string().optional(),
  hasApiKey: z.boolean().default(false),
  apiKeyPreview: z.string().optional(),
  configPath: z.string().optional(),
  source: z.enum(['default', 'env', 'local']).default('default'),
  ready: z.boolean().default(false),
  warning: z.string().optional(),
})
export type PlannerProviderConfigPublic = z.infer<typeof PlannerProviderConfigPublic>

export const DEFAULT_PROVIDER_MODELS: Record<SupportedPlannerProvider, string> = {
  mock: 'mock',
  openai: 'gpt-4o',
  anthropic: 'claude-opus-4-6',
  ollama: 'llama3.1',
}

export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
