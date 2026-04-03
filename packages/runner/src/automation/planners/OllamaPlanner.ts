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

    // Local models can be very slow; use a generous 120-second timeout
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), 120_000)

    let raw: string
    try {
      const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
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
        eval_count?: number
        prompt_eval_count?: number
      }

      if (body.eval_count !== undefined || body.prompt_eval_count !== undefined) {
        console.info(`[planner:${this.name}] token_usage prompt=${body.prompt_eval_count ?? '?'} completion=${body.eval_count ?? '?'}`)
      }

      raw = body.message?.content?.trim() ?? ''
      if (!raw) {
        return failedPlan(request, 'Ollama returned an empty response.', this.name)
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      const message = isTimeout
        ? `Ollama request timed out after 120s. The model may be overloaded or not loaded.`
        : err instanceof Error ? err.message : String(err)
      return failedPlan(request, `Ollama API error: ${message}`, this.name)
    } finally {
      clearTimeout(timeoutHandle)
    }

    return parsePlanFromJson(raw, request, this.name)
  }
}
