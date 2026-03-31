import type { TaskRequest, TaskPlan } from '@browser-automation/shared'

/**
 * Every planner must implement this interface.
 * The plan() call may be async (network call to LLM, local heuristics, etc.)
 */
export interface IPlanner {
  /** Human-readable name shown in logs and plan metadata */
  readonly name: string

  /**
   * Generate a TaskPlan from the user's request.
   * Should never throw — return a plan with status 'failed' if something goes wrong.
   */
  plan(request: TaskRequest): Promise<TaskPlan>
}
