import Fastify from 'fastify'
import { Redis } from 'ioredis'
import { createBot } from '@sfa/bot'

const logger = Fastify({ logger: true })

async function main() {
  const app = Fastify({ logger: true })
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD
  })

  const bot = createBot(redis)

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString()
  }))

  // Telegram webhook endpoint
  const webhookPath = `/webhook/${process.env.BOT_TOKEN}`
  app.post(webhookPath, async (req, reply) => {
    await bot.handleUpdate(req.body as any)
    reply.status(200).send('ok')
  })

  const port = Number(process.env.PORT ?? 3000)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`API running on port ${port}`)
}

main().catch((err) => {
  console.error('Fatal error during API startup:', err)
  process.exit(1)
})
