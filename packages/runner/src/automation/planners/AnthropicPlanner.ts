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
    const userContent = buildPlannerInput(request)

    let raw: string
    try {
      const msg = await this.client.messages.create({
        model: this.options.model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      })
      const block = msg.content.find((candidate) => candidate.type === 'text')
      raw = block?.type === 'text' ? block.text.trim() : ''
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return failedPlan(request, `Anthropic API error: ${message}`, this.name)
    }

    return parsePlanFromJson(raw, request, this.name)
  }
}
