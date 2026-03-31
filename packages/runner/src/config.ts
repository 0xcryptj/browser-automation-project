import 'dotenv/config'
import { z } from 'zod'

const resolvedPort = process.env.RUNNER_PORT ?? process.env.PORT ?? '3000'

const schema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  HEADLESS: z
    .string()
    .optional()
    .transform((value) => value === 'true')
    .default('false'),
  SLOW_MO: z.coerce.number().int().min(0).default(60),
  PLANNER_PROVIDER: z
    .enum(['mock', 'anthropic', 'openai', 'ollama', 'groq', 'moonshot'])
    .default('mock'),
  ANTHROPIC_API_KEY: z.string().trim().optional(),
  ANTHROPIC_MODEL: z.string().trim().default('claude-opus-4-6'),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_MODEL: z.string().trim().default('gpt-4o'),
  OLLAMA_BASE_URL: z.string().trim().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().trim().default('llama3.1'),
  ASSIST_MODEL: z.string().trim().optional(),
  RUNNER_CONFIG_PATH: z.string().trim().optional(),
})

const result = schema.safeParse({
  ...process.env,
  PORT: resolvedPort,
  PLANNER_PROVIDER: process.env.PLANNER_PROVIDER ?? process.env.PLANNER ?? 'mock',
})

if (!result.success) {
  console.error('\nInvalid runner configuration:\n')
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.')} - ${issue.message}`)
  }
  console.error('\nCheck your .env file (see .env.example).\n')
  process.exit(1)
}

export const config = {
  PORT: result.data.PORT,
  HOST: result.data.HOST,
  HEADLESS: result.data.HEADLESS,
  SLOW_MO: result.data.SLOW_MO,
  ASSIST_MODEL: result.data.ASSIST_MODEL,
  RUNNER_CONFIG_PATH: result.data.RUNNER_CONFIG_PATH,
}

export const plannerEnvDefaults = {
  provider: result.data.PLANNER_PROVIDER,
  openai: {
    model: result.data.OPENAI_MODEL,
    apiKey: result.data.OPENAI_API_KEY,
  },
  anthropic: {
    model: result.data.ANTHROPIC_MODEL,
    apiKey: result.data.ANTHROPIC_API_KEY,
  },
  ollama: {
    baseUrl: result.data.OLLAMA_BASE_URL,
    model: result.data.OLLAMA_MODEL,
  },
}

export type Config = typeof config
