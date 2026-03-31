import type { TaskPlan, TaskRequest } from '@browser-automation/shared'
import type { IPlanner } from './IPlanner.ts'
import { SYSTEM_PROMPT_EXPORT as SYSTEM_PROMPT } from './prompts.ts'
import { buildPlannerInput, failedPlan, parsePlanFromJson } from './shared.ts'

export class OllamaPlanner implements IPlanner {
  readonly name: string

  constructor(
    private readonly options: {
      model: string
      baseUrl: string
    }
  ) {
    this.name = `ollama/${options.model}`
  }

  async plan(request: TaskRequest): Promise<TaskPlan> {
    const userContent = buildPlannerInput(request)

    let raw: string
    try {
      const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.options.model,
          stream: false,
          format: 'json',
          options: {
            temperature: 0,
          },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        }),
      })

      if (!response.ok) {
        return failedPlan(
          request,
          `Ollama API error: ${response.status} ${response.statusText}`,
          this.name
        )
      }

      const body = (await response.json()) as {
        message?: { content?: string }
      }
      raw = body.message?.content?.trim() ?? ''
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return failedPlan(request, `Ollama API error: ${message}`, this.name)
    }

    return parsePlanFromJson(raw, request, this.name)
  }
}
