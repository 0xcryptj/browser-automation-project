import { createServer } from './server.js'

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '127.0.0.1'

const server = await createServer()

try {
  await server.listen({ port: PORT, host: HOST })
  console.log(`\n🚀 Runner listening at http://${HOST}:${PORT}`)
  console.log(`   Health: http://${HOST}:${PORT}/health`)
  console.log(`   Task:   POST http://${HOST}:${PORT}/task\n`)
} catch (err) {
  server.log.error(err)
  process.exit(1)
}
