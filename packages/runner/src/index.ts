import { config } from './config.js'
import { registerBrowserShutdownHooks } from './automation/browserManager.js'
import { getPublicBrowserConfig } from './settings/browserConfigStore.js'
import { getPublicPlannerConfig } from './settings/plannerConfigStore.js'
import { createServer } from './server.js'

registerBrowserShutdownHooks()

const server = await createServer()

try {
  await server.listen({ port: config.PORT, host: config.HOST })

  const baseUrl = `http://${config.HOST}:${config.PORT}`
  const planner = await getPublicPlannerConfig()
  const browserTarget = await getPublicBrowserConfig()
  console.log(`[runner] listening at ${baseUrl}`)
  console.log(
    `[runner] planner=${planner.provider}/${planner.model ?? 'default'} source=${planner.source} ready=${String(planner.ready)} headless=${String(config.HEADLESS)}`
  )
  console.log(
    `[runner] browserTarget=${browserTarget.mode}${browserTarget.cdpUrl ? ` ${browserTarget.cdpUrl}` : ''} ready=${String(browserTarget.ready)}`
  )
} catch (err: unknown) {
  const e = err as NodeJS.ErrnoException
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${config.PORT} is already in use.`)
    console.error(`Set RUNNER_PORT or PORT to another value, for example RUNNER_PORT=3001.`)
    console.error(`Windows: netstat -ano | findstr :${config.PORT}`)
    console.error(`Windows: taskkill /PID <pid> /F`)
  } else {
    server.log.error(err)
  }
  process.exit(1)
}
