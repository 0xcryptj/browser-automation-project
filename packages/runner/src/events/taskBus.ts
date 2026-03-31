import { EventEmitter } from 'node:events'
import type { TaskEvent } from '@browser-automation/shared'

const EVENT_BUFFER_TTL_MS = 5 * 60 * 1000 // keep events for 5 minutes

class TaskBus extends EventEmitter {
  private buffers = new Map<string, { events: TaskEvent[]; createdAt: number }>()

  publish(event: TaskEvent): void {
    // Buffer the event so late SSE subscribers can replay
    const key = event.taskId
    let buf = this.buffers.get(key)
    if (!buf) {
      buf = { events: [], createdAt: Date.now() }
      this.buffers.set(key, buf)
    }
    buf.events.push(event)
    buf.createdAt = Date.now()

    this.emit('all', event)
    this.emit(`task:${key}`, event)

    // Prune stale buffers periodically
    if (Math.random() < 0.05) this.prune()
  }

  /**
   * Subscribe to live events for a task.
   * If the task has already emitted events, replays them immediately via `onReplay`
   * before wiring the live subscription.
   */
  subscribe(
    taskId: string,
    handler: (e: TaskEvent) => void,
    onReplay?: (events: TaskEvent[]) => void
  ): () => void {
    const buffered = this.buffers.get(taskId)
    if (buffered && onReplay) {
      // Replay past events synchronously so the SSE client catches up
      onReplay([...buffered.events])
    }

    const channel = `task:${taskId}`
    this.on(channel, handler)
    return () => this.off(channel, handler)
  }

  getEvents(taskId: string): TaskEvent[] {
    const buffered = this.buffers.get(taskId)
    return buffered ? [...buffered.events] : []
  }

  getRecentTasks(limit = 20): Array<{ taskId: string; eventCount: number; lastEventType: TaskEvent['type']; updatedAt: number }> {
    return [...this.buffers.entries()]
      .map(([taskId, buffer]) => ({
        taskId,
        eventCount: buffer.events.length,
        lastEventType: buffer.events[buffer.events.length - 1]?.type ?? 'connected',
        updatedAt: buffer.createdAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
  }

  private prune() {
    const cutoff = Date.now() - EVENT_BUFFER_TTL_MS
    for (const [key, buf] of this.buffers) {
      if (buf.createdAt < cutoff) this.buffers.delete(key)
    }
  }
}

export const taskBus = new TaskBus()
taskBus.setMaxListeners(500)
