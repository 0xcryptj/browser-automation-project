import type { FastifyInstance } from 'fastify'
import type { TaskPlan, TaskResult } from '@browser-automation/shared'
import { TaskRequest, ApprovalRequest } from '@browser-automation/shared'
import { getPlanner } from '../automation/planners/index.js'
import { execute } from '../automation/executor.js'
import { taskBus } from '../events/taskBus.js'

// In-memory stores — replace with SQLite when persistence is needed
const planStore = new Map<string, TaskPlan>()
const resultStore = new Map<string, TaskResult>()

function buildFailedResult(taskPlan: TaskPlan, error: string): TaskResult {
  return {
    taskId: taskPlan.id,
    plan: { ...taskPlan, status: 'failed' },
    error,
  }
}

export async function taskRoutes(server: FastifyInstance) {
  /**
   * POST /task
   * Validate → Plan (async, LLM or mock) → Start execution async → return 202 immediately.
   */
  server.post('/task', async (request, reply) => {
    const parse = TaskRequest.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid request', issues: parse.error.issues })
    }

    const taskRequest = parse.data
    server.log.info(`[task] "${taskRequest.prompt.slice(0, 80)}" (${taskRequest.id})`)

    // Plan (may be async LLM call)
    const planner = await getPlanner()
    let taskPlan: TaskPlan
    try {
      taskPlan = await planner.plan(taskRequest)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      taskPlan = {
        id: taskRequest.id,
        prompt: taskRequest.prompt,
        steps: [],
        context: taskRequest.observation
          ? {
              url: taskRequest.url ?? taskRequest.observation.url,
              title: taskRequest.title ?? taskRequest.observation.title,
              snapshot: taskRequest.observation.snapshot,
            }
          : {
              url: taskRequest.url,
              title: taskRequest.title,
            },
        status: 'failed',
        summary: `Planning failed: ${msg}`,
        plannerUsed: planner.name,
        createdAt: Date.now(),
      }
    }

    if (taskPlan.status === 'failed') {
      const error = taskPlan.summary ?? 'Planning produced no valid steps'
      planStore.set(taskPlan.id, taskPlan)
      resultStore.set(taskPlan.id, {
        taskId: taskPlan.id,
        plan: taskPlan,
        error,
      })
      taskBus.publish({ type: 'task_started', taskId: taskPlan.id, prompt: taskPlan.prompt, mode: taskRequest.mode })
      taskBus.publish({
        type: 'task_failed',
        taskId: taskPlan.id,
        error,
      })
      return reply.status(202).send({
        taskId: taskPlan.id,
        plan: taskPlan,
        error,
      })
    }

    planStore.set(taskPlan.id, taskPlan)

    // Execute async — client streams via GET /task/:id/stream
    execute(taskPlan)
      .then((result) => {
        resultStore.set(result.taskId, result)
        planStore.set(result.plan.id, result.plan)
      })
      .catch((err) => {
        const error = err instanceof Error ? err.message : String(err)
        const failedPlan: TaskPlan = {
          ...taskPlan,
          status: 'failed',
          summary: taskPlan.summary ?? `Execution failed: ${error}`,
        }
        planStore.set(taskPlan.id, failedPlan)
        resultStore.set(taskPlan.id, buildFailedResult(failedPlan, error))
        taskBus.publish({
          type: 'task_failed',
          taskId: taskPlan.id,
          error,
        })
      })

    return reply.status(202).send({ taskId: taskPlan.id, plan: taskPlan })
  })

  /**
   * GET /task/:id
   * Returns full TaskResult if done, otherwise current plan state.
   */
  server.get<{ Params: { id: string } }>('/task/:id', async (request, reply) => {
    const { id } = request.params
    const result = resultStore.get(id)
    if (result) return reply.send(result)
    const stored = planStore.get(id)
    if (!stored) return reply.status(404).send({ error: 'Task not found' })
    return reply.send({ taskId: id, plan: stored })
  })

  /**
   * GET /task/:id/stream
   * Server-Sent Events: streams task execution events in real time.
   * Replays buffered events on connect so late subscribers catch up.
   */
  server.get<{ Params: { id: string } }>('/task/:id/stream', async (request, reply) => {
    const { id } = request.params
    const res = reply.raw

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    })

    const write = (data: unknown) => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      }
    }

    write({ type: 'connected', taskId: id })

    let shouldClose = false

    const unsubscribe = taskBus.subscribe(
      id,
      (event) => {
        write(event)
        if (event.type === 'task_completed' || event.type === 'task_failed' || event.type === 'task_cancelled') {
          shouldClose = true
          setTimeout(() => { if (!res.writableEnded) res.end() }, 300)
        }
      },
      (pastEvents) => {
        for (const e of pastEvents) {
          write(e)
          if (e.type === 'task_completed' || e.type === 'task_failed' || e.type === 'task_cancelled') {
            shouldClose = true
          }
        }
        if (shouldClose) {
          setTimeout(() => { if (!res.writableEnded) res.end() }, 300)
        }
      }
    )

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (res.writableEnded || res.destroyed) { clearInterval(heartbeat); return }
      res.write(': ping\n\n')
    }, 20_000)

    return new Promise<void>((resolve) => {
      const cleanup = () => { clearInterval(heartbeat); unsubscribe(); resolve() }
      request.raw.on('close', cleanup)
      res.on('finish', cleanup)
    })
  })

  /**
   * POST /task/:id/approve
   * Approve or deny a pending approval step and resume execution.
   */
  server.post<{ Params: { id: string } }>('/task/:id/approve', async (request, reply) => {
    const parse = ApprovalRequest.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid approval', issues: parse.error.issues })
    }

    const { approved, stepIndex } = parse.data
    const stored = planStore.get(request.params.id)
    if (!stored) return reply.status(404).send({ error: 'Task not found' })

    const steps = stored.steps.map((s, i) => {
      if (i !== stepIndex) return s
      if (!approved) return { ...s, status: 'skipped' as const, result: 'Denied by user' }
      return { ...s, action: { ...s.action, requiresApproval: false }, status: 'pending' as const }
    })

    const resumedPlan: TaskPlan = { ...stored, steps, status: 'planned' }
    planStore.set(resumedPlan.id, resumedPlan)

    execute(resumedPlan)
      .then((result) => {
        resultStore.set(result.taskId, result)
        planStore.set(result.plan.id, result.plan)
      })
      .catch((err) => {
        const error = err instanceof Error ? err.message : String(err)
        const failedPlan: TaskPlan = {
          ...resumedPlan,
          status: 'failed',
          summary: resumedPlan.summary ?? `Execution failed: ${error}`,
        }
        planStore.set(resumedPlan.id, failedPlan)
        resultStore.set(resumedPlan.id, buildFailedResult(failedPlan, error))
        taskBus.publish({
          type: 'task_failed',
          taskId: stored.id,
          error,
        })
      })

    return reply.status(202).send({ taskId: stored.id, plan: resumedPlan })
  })

  /**
   * POST /task/:id/cancel
   * Cancel a running task.
   */
  server.post<{ Params: { id: string } }>('/task/:id/cancel', async (request, reply) => {
    const stored = planStore.get(request.params.id)
    if (!stored) return reply.status(404).send({ error: 'Task not found' })

    taskBus.publish({
      type: 'task_cancelled',
      taskId: request.params.id,
      reason: 'Task cancelled by user',
    })
    planStore.set(stored.id, { ...stored, status: 'cancelled' })

    return reply.send({ ok: true })
  })
}
