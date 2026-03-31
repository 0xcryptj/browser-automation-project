import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import { healthRoutes } from './routes/health.js'
import { settingsRoutes } from './routes/settings.js'
import { taskRoutes } from './routes/task.js'
import { assistRoutes } from './routes/assist.js'

export async function createServer() {
  const server = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, ignore: 'pid,hostname', singleLine: true },
      },
    },
  })

  // CORS: allow Chrome extension origins + localhost only (never open to the world)
  await server.register(cors, {
    origin: (origin, cb) => {
      const allowed =
        !origin ||
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('http://' + config.HOST)
      if (allowed) {
        cb(null, true)
      } else {
        cb(new Error(`CORS: blocked origin ${origin}`), false)
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })

  await server.register(healthRoutes)
  await server.register(settingsRoutes)
  await server.register(taskRoutes)
  await server.register(assistRoutes)

  return server
}
