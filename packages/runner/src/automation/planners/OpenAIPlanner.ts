import OpenAI from 'openai'
import type { TaskPlan, TaskRequest } from '@browser-automation/shared'
import type { IPlanner } from './IPlanner.ts'
import { SYSTEM_PROMPT_EXPORT as SYSTEM_PROMPT } from './prompts.ts'
import { buildPlannerInput, failedPlan, parsePlanFromJson } from './shared.ts'

export class OpenAIPlanner implements IPlanner {
  readonly name: string
  private client: OpenAI

  constructor(
    private readonly options: {
      apiKey: string
      model: string
      baseUrl?: string
    }
  ) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
    })
    this.name = `openai/${options.model}`
  }

  async plan(request: TaskRequest): Promise<TaskPlan> {
    const userContent = buildPlannerInput(request)

    let raw: string
    try {
      const completion = await this.client.chat.completions.create({
        model: this.options.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 2048,
      })
      raw = completion.choices[0]?.message?.content?.trim() ?? ''
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return failedPlan(request, `OpenAI API error: ${message}`, this.name)
    }

    return parsePlanFromJson(raw, request, this.name)
  }
}
