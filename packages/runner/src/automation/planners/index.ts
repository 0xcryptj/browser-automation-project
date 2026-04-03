import type { IPlanner } from './IPlanner.js'
import { MockPlanner } from './MockPlanner.js'
import { AnthropicPlanner } from './AnthropicPlanner.js'
import { OpenAIPlanner } from './OpenAIPlanner.js'
import { OllamaPlanner } from './OllamaPlanner.js'
import { getResolvedPlannerConfig } from '../../settings/plannerConfigStore.js'

export async function getPlanner(): Promise<IPlanner> {
  const runtimeConfig = await getResolvedPlannerConfig()

  if (runtimeConfig.provider === 'anthropic') {
    if (runtimeConfig.ready && runtimeConfig.apiKey) {
      const planner = new AnthropicPlanner({
        apiKey: runtimeConfig.apiKey,
        model: runtimeConfig.model ?? 'claude-opus-4-6',
        baseUrl: runtimeConfig.baseUrl,
      })
      console.log(`[planner] Using planner: ${planner.name}`)
      return planner
    }
    console.warn(`[planner] Anthropic provider not ready — falling back to mock. Reason: ${runtimeConfig.warning ?? 'no API key configured'}`)
  }

  if (runtimeConfig.provider === 'openai') {
    if (runtimeConfig.ready && runtimeConfig.apiKey) {
      const planner = new OpenAIPlanner({
        apiKey: runtimeConfig.apiKey,
        model: runtimeConfig.model ?? 'gpt-4o',
        baseUrl: runtimeConfig.baseUrl,
      })
      console.log(`[planner] Using planner: ${planner.name}`)
      return planner
    }
    console.warn(`[planner] OpenAI provider not ready — falling back to mock. Reason: ${runtimeConfig.warning ?? 'no API key configured'}`)
  }

  if (runtimeConfig.provider === 'ollama') {
    if (runtimeConfig.ready) {
      const planner = new OllamaPlanner({
        model: runtimeConfig.model ?? 'llama3.1',
        baseUrl: runtimeConfig.baseUrl ?? 'http://127.0.0.1:11434',
      })
      console.log(`[planner] Using planner: ${planner.name}`)
      return planner
    }
    console.warn(`[planner] Ollama provider not ready — falling back to mock. Reason: ${runtimeConfig.warning ?? 'model or endpoint unavailable'}`)
  }

  const planner = new MockPlanner()
  const reason = runtimeConfig.warning ? ` (${runtimeConfig.warning})` : ''
  console.log(`[planner] Using planner: ${planner.name}${reason}`)
  return planner
}
