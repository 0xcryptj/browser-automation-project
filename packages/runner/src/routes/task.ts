import type { FastifyInstance } from 'fastify'
import type { TaskPlan, TaskResult } from '@browser-automation/shared'
import { TaskRequest, ApprovalRequest } from '@browser-automation/shared'
import { plan } from '../automation/planner.js'
import { execute } from '../automation/executor.js'
import { taskBus } from '../events/taskBus.js'

// In-memory stores (replace with DB for persistence)
const planStore = new Map<string, TaskPlan>()
const resultStore = new Map<string, TaskResult>()

export async function taskRoutes(server: FastifyInstance) {
  /**
   * POST /task
   * Validates request, builds a plan, starts execution async,
   * returns {taskId, plan} immediately so the client can stream.
   */
  server.post('/task', async (request, reply) => {
    const parse = TaskRequest.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid request', issues: parse.error.issues })
    }

    const taskRequest = parse.data
    server.log.info(`[task] "${taskRequest.prompt}" (${taskRequest.id})`)

    const taskPlan = plan(taskRequest)
    planStore.set(taskPlan.id, taskPlan)

    // Run async — client streams via /task/:id/stream
    execute(taskPlan)
      .then((result) => {
        resultStore.set(result.taskId, result)
        planStore.set(result.plan.id, result.plan)
      })
      .catch((err) => {
        taskBus.publish({ type: 'task_error', taskId: taskPlan.id, error: String(err) })
      })

    return reply.status(202).send({ taskId: taskPlan.id, plan: taskPlan })
  })

  /**
   * GET /task/:id
   * Returns current task state. If done, includes full result with screenshots.
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

    // Subscribe with replay: sends any buffered events first, then live ones
    const unsubscribe = taskBus.subscribe(
      id,
      // live handler
      (event) => {
        write(event)
        if (event.type === 'task_completed' || event.type === 'task_error') {
          shouldClose = true
          setTimeout(() => { if (!res.writableEnded) res.end() }, 200)
        }
      },
      // replay past events
      (pastEvents) => {
        for (const e of pastEvents) {
          write(e)
          if (e.type === 'task_completed' || e.type === 'task_error') {
            shouldClose = true
          }
        }
        if (shouldClose) {
          setTimeout(() => { if (!res.writableEnded) res.end() }, 200)
        }
      }
    )

    // Heartbeat keeps the connection alive through proxies
    const heartbeat = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(heartbeat)
        return
      }
      res.write(': ping\n\n')
    }, 20_000)

    // Clean up on client disconnect
    return new Promise<void>((resolve) => {
      const cleanup = () => {
        clearInterval(heartbeat)
        unsubscribe()
        resolve()
      }
      request.raw.on('close', cleanup)
      res.on('finish', cleanup)
    })
  })

  /**
   * POST /task/:id/approve
   * Approve or deny the currently pending approval step, then resume execution.
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

    // Resume execution async
    execute(resumedPlan)
      .then((result) => {
        resultStore.set(result.taskId, result)
        planStore.set(result.plan.id, result.plan)
      })
      .catch((err) => {
        taskBus.publish({ type: 'task_error', taskId: stored.id, error: String(err) })
      })

    return reply.status(202).send({ taskId: stored.id, plan: resumedPlan })
  })
}
