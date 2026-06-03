import { Queue, Worker } from 'bullmq'
import pino from 'pino'
import { AcumaticaAdapter, AcumaticaClient } from '@sfa/erp-adapter'
import { syncARJob } from './sync-ar.job'
import { syncPricelistJob } from './sync-pricelist.job'
import { syncProductsJob } from './sync-products.job'
import { syncCustomersJob } from './sync-customers.job'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

const JOB_NAMES = {
  SYNC_AR: 'sync:ar',
  SYNC_PRICELIST: 'sync:pricelist',
  SYNC_PRODUCTS: 'sync:products',
  SYNC_CUSTOMERS: 'sync:customers',
  NOTIFY_SUPERVISOR_MORNING: 'notify:supervisor-morning',
  NOTIFY_SUPERVISOR_MIDDAY: 'notify:supervisor-midday',
  NOTIFY_SUPERVISOR_EOD: 'notify:supervisor-eod'
} as const

// Plain object — hindari konflik versi ioredis antara BullMQ dan app
const redisConnection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined
}

async function main() {
  const acumaticaClient = new AcumaticaClient({
    baseUrl: process.env.ACUMATICA_BASE_URL!,
    company: process.env.ACUMATICA_COMPANY!,
    branch: process.env.ACUMATICA_BRANCH!,
    username: process.env.ACUMATICA_USERNAME!,
    password: process.env.ACUMATICA_PASSWORD!
  })
  const erpAdapter = new AcumaticaAdapter(acumaticaClient)

  const queue = new Queue('sfa-jobs', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 }
    }
  })

  // ─── Schedule recurring jobs ───────────────────────────────────────────────
  await queue.upsertJobScheduler(JOB_NAMES.SYNC_AR,        { pattern: '0 */2 * * *' })
  await queue.upsertJobScheduler(JOB_NAMES.SYNC_PRICELIST, { pattern: '0 */6 * * *' })
  await queue.upsertJobScheduler(JOB_NAMES.SYNC_PRODUCTS,  { pattern: '0 */12 * * *' })
  await queue.upsertJobScheduler(JOB_NAMES.SYNC_CUSTOMERS, { pattern: '0 2 * * *' })
  // Notifikasi supervisor WIB (UTC+7) → UTC
  await queue.upsertJobScheduler(JOB_NAMES.NOTIFY_SUPERVISOR_MORNING, { pattern: '0 1 * * 1-6' })
  await queue.upsertJobScheduler(JOB_NAMES.NOTIFY_SUPERVISOR_MIDDAY,  { pattern: '0 6 * * 1-6' })
  await queue.upsertJobScheduler(JOB_NAMES.NOTIFY_SUPERVISOR_EOD,     { pattern: '30 10 * * 1-6' })

  // ─── Worker ───────────────────────────────────────────────────────────────
  const worker = new Worker(
    'sfa-jobs',
    async (job) => {
      logger.info({ jobName: job.name, jobId: job.id }, 'Job started')

      switch (job.name) {
        case JOB_NAMES.SYNC_AR:
          await syncARJob(job, erpAdapter); break

        case JOB_NAMES.SYNC_PRICELIST:
          await syncPricelistJob(job, erpAdapter); break

        case JOB_NAMES.SYNC_PRODUCTS:
          await syncProductsJob(job, erpAdapter); break

        case JOB_NAMES.SYNC_CUSTOMERS:
          await syncCustomersJob(job, erpAdapter); break

        case JOB_NAMES.NOTIFY_SUPERVISOR_MORNING:
        case JOB_NAMES.NOTIFY_SUPERVISOR_MIDDAY:
        case JOB_NAMES.NOTIFY_SUPERVISOR_EOD:
          logger.info({ jobName: job.name }, 'Supervisor notify — Sprint 3')
          break

        default:
          logger.warn({ jobName: job.name }, 'Unknown job')
      }
    },
    { connection: redisConnection, concurrency: 3 }
  )

  worker.on('completed', (job) => logger.info({ jobName: job.name, jobId: job.id }, 'Job completed'))
  worker.on('failed', (job, err) => logger.error({ jobName: job?.name, err }, 'Job failed'))

  logger.info('Job workers started')

  process.once('SIGINT',  async () => { await worker.close(); await queue.close() })
  process.once('SIGTERM', async () => { await worker.close(); await queue.close() })
}

main().catch((err) => {
  pino().error(err, 'Fatal error during jobs startup')
  process.exit(1)
})
