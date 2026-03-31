import type { IPlanner } from './IPlanner.ts'
import { MockPlanner } from './MockPlanner.ts'
import { AnthropicPlanner } from './AnthropicPlanner.ts'
import { OpenAIPlanner } from './OpenAIPlanner.ts'
import { OllamaPlanner } from './OllamaPlanner.ts'
import { getResolvedPlannerConfig } from '../../settings/plannerConfigStore.js'

export async function getPlanner(): Promise<IPlanner> {
  const runtimeConfig = await getResolvedPlannerConfig()

  if (runtimeConfig.provider === 'anthropic' && runtimeConfig.ready && runtimeConfig.apiKey) {
    const planner = new AnthropicPlanner({
      apiKey: runtimeConfig.apiKey,
      model: runtimeConfig.model ?? 'claude-opus-4-6',
      baseUrl: runtimeConfig.baseUrl,
    })
    console.log(`[planner] Using planner: ${planner.name}`)
    return planner
  }

  if (runtimeConfig.provider === 'openai' && runtimeConfig.ready && runtimeConfig.apiKey) {
    const planner = new OpenAIPlanner({
      apiKey: runtimeConfig.apiKey,
      model: runtimeConfig.model ?? 'gpt-4o',
      baseUrl: runtimeConfig.baseUrl,
    })
    console.log(`[planner] Using planner: ${planner.name}`)
    return planner
  }

  if (runtimeConfig.provider === 'ollama' && runtimeConfig.ready) {
    const planner = new OllamaPlanner({
      model: runtimeConfig.model ?? 'llama3.1',
      baseUrl: runtimeConfig.baseUrl ?? 'http://127.0.0.1:11434',
    })
    console.log(`[planner] Using planner: ${planner.name}`)
    return planner
  }

  const planner = new MockPlanner()
  const reason = runtimeConfig.warning ? ` (${runtimeConfig.warning})` : ''
  console.log(`[planner] Using planner: ${planner.name}${reason}`)
  return planner
}
