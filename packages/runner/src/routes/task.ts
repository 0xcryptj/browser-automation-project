import type { FastifyInstance } from 'fastify'
import type { TaskPlan, TaskRequest, TaskResult } from '@browser-automation/shared'
import { TaskRequest as TaskRequestSchema, ApprovalRequest } from '@browser-automation/shared'
import { getPlanner } from '../automation/planners/index.js'
import { execute } from '../automation/executor.js'
import { taskBus } from '../events/taskBus.js'

// In-memory stores — replace with SQLite when persistence is needed
const planStore = new Map<string, TaskPlan>()
const resultStore = new Map<string, TaskResult>()
let executionQueue = Promise.resolve()

function buildFailedResult(taskPlan: TaskPlan, error: string): TaskResult {
  return {
    taskId: taskPlan.id,
    plan: { ...taskPlan, status: 'failed' },
    error,
  }
}

function makePlanningErrorPlan(
  taskRequest: TaskRequest,
  plannerName: string,
  error: string
): TaskPlan {
  return {
    id: taskRequest.id,
    prompt: taskRequest.prompt,
    steps: [],
    context: taskRequest.observation
      ? {
          url: taskRequest.url ?? taskRequest.observation.url,
          title: taskRequest.title ?? taskRequest.observation.title,
          snapshot: taskRequest.observation.snapshot,
          text: taskRequest.observation.text,
          headings: taskRequest.observation.headings,
          textBlocks: taskRequest.observation.textBlocks?.map((block) => block.text),
        }
      : {
          url: taskRequest.url,
          title: taskRequest.title,
        },
    status: 'failed',
    summary: `Planning failed: ${error}`,
    plannerUsed: plannerName,
    createdAt: Date.now(),
  }
}

export async function taskRoutes(server: FastifyInstance) {
  const enqueueExecution = (taskPlan: TaskPlan) => {
    executionQueue = executionQueue
      .catch(() => {
        // Keep the queue moving after prior failures.
      })
      .then(async () => {
        // Mark the plan as running so the store always reflects the true state.
        // If the process is killed mid-execution, a GET /task/:id will return
        // status:'running' rather than the stale 'planned' value.
        planStore.set(taskPlan.id, { ...taskPlan, status: 'running' })
        const result = await execute(taskPlan)
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

    return executionQueue
  }

  /**
   * POST /task
   * Validate → Plan (async, LLM or mock) → Start execution async → return 202 immediately.
   */
  server.post('/task', async (request, reply) => {
    const parse = TaskRequestSchema.safeParse(request.body)
    if (!parse.success) {
      const summary = parse.error.issues
        .slice(0, 4)
        .map((i) => {
          const path = i.path.join('.')
          return path ? `${path}: ${i.message}` : i.message
        })
        .join(', ')
      server.log.warn(`[task] Invalid request — ${summary}`)
      return reply.status(400).send({ error: 'Invalid request', detail: summary, issues: parse.error.issues })
    }

    // Override client-supplied ID with a server-generated one to prevent collision/hijacking
    const taskRequest = { ...parse.data, id: crypto.randomUUID() }
    server.log.info(`[task] "${taskRequest.prompt.slice(0, 80)}" (${taskRequest.id})`)

    // Plan (may be async LLM call)
    const planner = await getPlanner()
    let taskPlan: TaskPlan
    try {
      taskPlan = await planner.plan(taskRequest)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      taskPlan = makePlanningErrorPlan(taskRequest, planner.name, msg)
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
    void enqueueExecution(taskPlan)

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

  server.get<{ Params: { id: string } }>('/task/:id/events', async (request, reply) => {
    const { id } = request.params
    const plan = planStore.get(id)
    const result = resultStore.get(id)
    const events = taskBus.getEvents(id)

    if (!plan && !result && events.length === 0) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    return reply.send({
      taskId: id,
      status: result?.plan.status ?? plan?.status ?? null,
      plannerUsed: result?.plan.plannerUsed ?? plan?.plannerUsed ?? null,
      events,
    })
  })

  /**
   * GET /task/:id/stream
   * Server-Sent Events: streams task execution events in real time.
   * Replays buffered events on connect so late subscribers catch up.
   * CORS is handled at the server level by @fastify/cors — do NOT add
   * Access-Control-Allow-Origin here, as that would bypass the origin allow-list.
   */
  server.get<{ Params: { id: string } }>('/task/:id/stream', async (request, reply) => {
    const { id } = request.params
    const res = reply.raw
    const origin = request.headers.origin

    const corsHeaders: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    }

    if (
      origin &&
      (origin.startsWith('chrome-extension://') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1'))
    ) {
      corsHeaders['Access-Control-Allow-Origin'] = origin
      corsHeaders['Access-Control-Allow-Credentials'] = 'true'
    }

    res.writeHead(200, corsHeaders)

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

    // Heartbeat keeps the connection alive through proxies, firewalls, and
    // browsers (like Brave) that may aggressively close idle connections.
    const heartbeat = setInterval(() => {
      if (res.writableEnded || res.destroyed) { clearInterval(heartbeat); return }
      res.write(': ping\n\n')
    }, 15_000)

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

    if (parse.data.taskId !== request.params.id) {
      return reply.status(400).send({ error: 'taskId mismatch' })
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

    void enqueueExecution(resumedPlan)

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
