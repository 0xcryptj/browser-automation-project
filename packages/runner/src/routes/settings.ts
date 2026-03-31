import type { FastifyInstance } from 'fastify'
import { PlannerProviderConfigInput } from '@browser-automation/shared'
import {
  clearPlannerSecret,
  getPublicPlannerConfig,
  savePlannerConfig,
} from '../settings/plannerConfigStore.js'

export async function settingsRoutes(server: FastifyInstance) {
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
