import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { getBrowserState } from '../automation/browserManager.js'
import { getPublicPlannerConfig } from '../settings/plannerConfigStore.js'

export async function healthRoutes(server: FastifyInstance) {
  server.get('/health', async () => {
    const browser = getBrowserState()
    const planner = await getPublicPlannerConfig()

    return {
      status: 'ok',
      version: '0.2.0',
      timestamp: new Date().toISOString(),
      service: 'browser-automation-runner',
      planner,
      headless: config.HEADLESS,
      browser,
    }
  })
}
