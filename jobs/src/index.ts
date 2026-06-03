import { Queue, Worker, QueueScheduler } from 'bullmq'
import { Redis } from 'ioredis'
import pino from 'pino'
import { AcumaticaAdapter, AcumaticaClient } from '@sfa/erp-adapter'
import { syncARJob } from './sync-ar.job'

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

async function main() {
  const connection = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null  // diperlukan oleh BullMQ
  })

  const acumaticaClient = new AcumaticaClient({
    baseUrl: process.env.ACUMATICA_BASE_URL!,
    company: process.env.ACUMATICA_COMPANY!,
    branch: process.env.ACUMATICA_BRANCH!,
    username: process.env.ACUMATICA_USERNAME!,
    password: process.env.ACUMATICA_PASSWORD!
  })
  const erpAdapter = new AcumaticaAdapter(acumaticaClient)

  const queue = new Queue('sfa-jobs', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 }
    }
  })

  // ─── Schedule recurring jobs ───────────────────────────────────────────────
  await queue.upsertJobScheduler(JOB_NAMES.SYNC_AR, { pattern: '0 */2 * * *' })           // tiap 2 jam
  await queue.upsertJobScheduler(JOB_NAMES.SYNC_PRICELIST, { pattern: '0 */6 * * *' })    // tiap 6 jam
  await queue.upsertJobScheduler(JOB_NAMES.SYNC_PRODUCTS, { pattern: '0 */12 * * *' })    // tiap 12 jam
  await queue.upsertJobScheduler(JOB_NAMES.SYNC_CUSTOMERS, { pattern: '0 2 * * *' })      // jam 02:00

  // Notifikasi supervisor — WIB (UTC+7), cron dalam UTC
  await queue.upsertJobScheduler(JOB_NAMES.NOTIFY_SUPERVISOR_MORNING, { pattern: '0 1 * * 1-6' })   // 08:00 WIB
  await queue.upsertJobScheduler(JOB_NAMES.NOTIFY_SUPERVISOR_MIDDAY, { pattern: '0 6 * * 1-6' })    // 13:00 WIB
  await queue.upsertJobScheduler(JOB_NAMES.NOTIFY_SUPERVISOR_EOD, { pattern: '30 10 * * 1-6' })     // 17:30 WIB

  // ─── Worker ───────────────────────────────────────────────────────────────
  const worker = new Worker(
    'sfa-jobs',
    async (job) => {
      logger.info({ jobName: job.name, jobId: job.id }, 'Job started')

      switch (job.name) {
        case JOB_NAMES.SYNC_AR:
          await syncARJob(job, erpAdapter)
          break

        case JOB_NAMES.SYNC_PRICELIST:
        case JOB_NAMES.SYNC_PRODUCTS:
        case JOB_NAMES.SYNC_CUSTOMERS:
        case JOB_NAMES.NOTIFY_SUPERVISOR_MORNING:
        case JOB_NAMES.NOTIFY_SUPERVISOR_MIDDAY:
        case JOB_NAMES.NOTIFY_SUPERVISOR_EOD:
          // Sprint 1-3 akan implementasi jobs ini
          logger.info({ jobName: job.name }, 'Job handler not yet implemented')
          break

        default:
          logger.warn({ jobName: job.name }, 'Unknown job')
      }
    },
    { connection, concurrency: 3 }
  )

  worker.on('completed', (job) => logger.info({ jobName: job.name, jobId: job.id }, 'Job completed'))
  worker.on('failed', (job, err) => logger.error({ jobName: job?.name, err }, 'Job failed'))

  logger.info('Job workers started')

  process.once('SIGINT', async () => { await worker.close(); await queue.close() })
  process.once('SIGTERM', async () => { await worker.close(); await queue.close() })
}

main().catch((err) => {
  pino().error(err, 'Fatal error during jobs startup')
  process.exit(1)
})
