import Fastify from 'fastify'
import cors from '@fastify/cors'
import { healthRoutes } from './routes/health.js'
import { taskRoutes } from './routes/task.js'

export async function createServer() {
  const server = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, ignore: 'pid,hostname' },
      },
    },
  })

  // CORS: allow Chrome extension origins + localhost
  await server.register(cors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
      ) {
        cb(null, true)
      } else {
        cb(new Error('CORS: origin not allowed'), false)
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })

  await server.register(healthRoutes)
  await server.register(taskRoutes)

  return server
}
