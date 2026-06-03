import { Redis } from 'ioredis'
import pino from 'pino'
import { createBot } from './bot'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

async function main() {
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD
  })

  redis.on('error', (err) => logger.error({ err }, 'Redis connection error'))
  redis.on('connect', () => logger.info('Redis connected'))

  const bot = createBot(redis)

  // Webhook mode (production) vs polling (development)
  if (process.env.WEBHOOK_URL) {
    const webhookPath = `/webhook/${process.env.BOT_TOKEN}`
    await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}${webhookPath}`)
    logger.info({ webhookPath }, 'Webhook set')
    // Webhook handler di-mount ke Fastify di apps/api
  } else {
    await bot.launch()
    logger.info('Bot started (polling mode)')
  }

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

main().catch((err) => {
  pino().error(err, 'Fatal error during bot startup')
  process.exit(1)
})
