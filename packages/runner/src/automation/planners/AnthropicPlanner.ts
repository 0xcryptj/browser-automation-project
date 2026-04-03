import Anthropic from '@anthropic-ai/sdk'
import type { TaskPlan, TaskRequest } from '@browser-automation/shared'
import type { IPlanner } from './IPlanner.ts'
import { SYSTEM_PROMPT_EXPORT as SYSTEM_PROMPT } from './prompts.ts'
import { buildPlannerInput, failedPlan, parsePlanFromJson } from './shared.ts'

export class AnthropicPlanner implements IPlanner {
  readonly name: string
  private client: Anthropic

  constructor(
    private readonly options: {
      apiKey: string
      model: string
      baseUrl?: string
    }
  ) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
    })
    this.name = `anthropic/${options.model}`
  }

  async plan(request: TaskRequest): Promise<TaskPlan> {
    if (!this.options.apiKey || !this.options.apiKey.trim()) {
      return failedPlan(request, 'Anthropic API key is missing or empty.', this.name)
    }

    const userContent = buildPlannerInput(request)

    let raw: string
    try {
      const msg = await this.client.messages.create({
        model: this.options.model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      })

      if (msg.stop_reason === 'max_tokens') {
        console.warn(`[planner:${this.name}] Response truncated (stop_reason=max_tokens). Consider raising max_tokens.`)
        return failedPlan(request, 'Anthropic response was truncated (max_tokens reached). The plan JSON is incomplete.', this.name)
      }

      const usage = msg.usage
      if (usage) {
        console.info(`[planner:${this.name}] token_usage input=${usage.input_tokens} output=${usage.output_tokens}`)
      }

      const block = msg.content.find((candidate) => candidate.type === 'text')
      raw = block?.type === 'text' ? block.text.trim() : ''
      if (!raw) {
        return failedPlan(request, 'Anthropic returned an empty response.', this.name)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return failedPlan(request, `Anthropic API error: ${message}`, this.name)
    }

    return parsePlanFromJson(raw, request, this.name)
  }
}
