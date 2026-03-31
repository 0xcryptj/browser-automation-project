import type { FastifyInstance } from 'fastify'
import { TaskRequest, ApprovalRequest } from '@browser-automation/shared'
import { plan } from '../automation/planner.js'
import { execute } from '../automation/executor.js'
import type { TaskPlan } from '@browser-automation/shared'

// In-memory task store (replace with DB / Redis for persistence)
const taskStore = new Map<string, TaskPlan>()

export async function taskRoutes(server: FastifyInstance) {
  /**
   * POST /task
   * Receives a task request, plans it, and executes it.
   * Returns the full TaskResult.
   */
  server.post('/task', async (request, reply) => {
    const parseResult = TaskRequest.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid request', issues: parseResult.error.issues })
    }

    const taskRequest = parseResult.data
    server.log.info(`[task] Received: "${taskRequest.prompt}" (id=${taskRequest.id})`)

    // Observe → Plan
    const taskPlan = plan(taskRequest)
    taskStore.set(taskPlan.id, taskPlan)

    // If plan requires approval on first step, return early
    if (taskPlan.status === 'awaiting_approval') {
      return reply.status(202).send({
        taskId: taskPlan.id,
        plan: taskPlan,
        durationMs: 0,
      })
    }

    // Execute → Verify → Recover
    const result = await execute(taskPlan)

    // Update store with final plan state
    taskStore.set(result.plan.id, result.plan)

    return reply.status(200).send(result)
  })

  /**
   * GET /task/:id
   * Returns the current state of a task.
   */
  server.get<{ Params: { id: string } }>('/task/:id', async (request, reply) => {
    const stored = taskStore.get(request.params.id)
    if (!stored) return reply.status(404).send({ error: 'Task not found' })
    return reply.send({ taskId: stored.id, plan: stored })
  })

  /**
   * POST /task/:id/approve
   * Approves (or denies) a step that was awaiting approval, then resumes execution.
   */
  server.post<{ Params: { id: string } }>('/task/:id/approve', async (request, reply) => {
    const parseResult = ApprovalRequest.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid approval request', issues: parseResult.error.issues })
    }

    const { approved, stepIndex } = parseResult.data
    const storedPlan = taskStore.get(request.params.id)
    if (!storedPlan) return reply.status(404).send({ error: 'Task not found' })

    const steps = [...storedPlan.steps]
    const step = steps[stepIndex]
    if (!step) return reply.status(400).send({ error: `Step ${stepIndex} not found` })

    if (!approved) {
      steps[stepIndex] = { ...step, status: 'skipped', result: 'Denied by user' }
    } else {
      steps[stepIndex] = { ...step, action: { ...step.action, requiresApproval: false } }
    }

    const updatedPlan: TaskPlan = { ...storedPlan, steps, status: 'planned' }
    taskStore.set(updatedPlan.id, updatedPlan)

    const result = await execute(updatedPlan)
    taskStore.set(result.plan.id, result.plan)

    return reply.send(result)
  })
}
