import type { TaskPlan, TaskRequest } from '@browser-automation/shared'
import { MockPlanner } from './planners/MockPlanner.js'

const legacyMockPlanner = new MockPlanner()

export function plan(request: TaskRequest): Promise<TaskPlan> {
  return legacyMockPlanner.plan(request)
}
