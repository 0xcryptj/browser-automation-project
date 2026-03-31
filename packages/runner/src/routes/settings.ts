import type { FastifyInstance } from 'fastify'
import { BrowserConnectionConfigInput, PlannerProviderConfigInput } from '@browser-automation/shared'
import {
  getPublicBrowserConfig,
  saveBrowserConfig,
} from '../settings/browserConfigStore.js'
import {
  clearPlannerSecret,
  getPublicPlannerConfig,
  savePlannerConfig,
} from '../settings/plannerConfigStore.js'

export async function settingsRoutes(server: FastifyInstance) {
  server.get('/settings/browser', async () => ({
    browser: await getPublicBrowserConfig(),
  }))

  server.put('/settings/browser', async (request, reply) => {
    const parsed = BrowserConnectionConfigInput.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid browser settings', issues: parsed.error.issues })
    }

    const browser = await saveBrowserConfig(parsed.data)
    return reply.send({ browser })
  })

  server.get('/settings/planner', async () => ({
    planner: await getPublicPlannerConfig(),
  }))

  server.put('/settings/planner', async (request, reply) => {
    const parsed = PlannerProviderConfigInput.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid planner settings', issues: parsed.error.issues })
    }

    const planner = await savePlannerConfig(parsed.data)
    return reply.send({ planner })
  })

  server.delete('/settings/planner/secret', async () => {
    const planner = await clearPlannerSecret()
    return { planner }
  })
}
