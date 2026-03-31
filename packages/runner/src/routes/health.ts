import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { getBrowserState } from '../automation/browserManager.js'
import { taskBus } from '../events/taskBus.js'
import { getPublicBrowserConfig } from '../settings/browserConfigStore.js'
import { getPublicPlannerConfig } from '../settings/plannerConfigStore.js'

export async function healthRoutes(server: FastifyInstance) {
  server.get('/health', async () => {
    const browser = getBrowserState()
    const planner = await getPublicPlannerConfig()
    const browserTarget = await getPublicBrowserConfig()

    return {
      status: 'ok',
      version: '0.2.0',
      timestamp: new Date().toISOString(),
      service: 'browser-automation-runner',
      planner,
      browserTarget,
      headless: config.HEADLESS,
      browser,
    }
  })

  server.get('/debug/status', async () => {
    const browser = getBrowserState()
    const planner = await getPublicPlannerConfig()
    const browserTarget = await getPublicBrowserConfig()

    return {
      timestamp: new Date().toISOString(),
      browser,
      browserTarget,
      planner,
      recentTasks: taskBus.getRecentTasks(12),
      runner: {
        host: config.HOST,
        port: config.PORT,
        headless: config.HEADLESS,
      },
    }
  })
}
