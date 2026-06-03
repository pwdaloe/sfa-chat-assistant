import { Job } from 'bullmq'
import { prisma } from '@sfa/db'
import type { IERPAdapter } from '@sfa/erp-adapter'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
const BATCH_SIZE = 50

function deriveARStatus(totalOverdue: number, oldestDueDate?: Date | null): 'CLEAR' | 'WARNING' | 'OVERDUE' {
  if (totalOverdue > 0) return 'OVERDUE'
  if (oldestDueDate) {
    const daysLeft = Math.ceil((oldestDueDate.getTime() - Date.now()) / 86400000)
    if (daysLeft <= 7) return 'WARNING'
  }
  return 'CLEAR'
}

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  )
}

export async function syncARJob(_job: Job, erpAdapter: IERPAdapter): Promise<void> {
  const syncJob = await prisma.syncJob.create({
    data: { jobType: 'ar', status: 'RUNNING' }
  })

  logger.info({ syncJobId: syncJob.id }, 'AR sync started')

  const customers = await prisma.customerAssignment.findMany({
    where: { isActive: true },
    select: { customerAcumaticaId: true },
    distinct: ['customerAcumaticaId']
  })

  const batches = chunk(customers.map(c => c.customerAcumaticaId), BATCH_SIZE)
  let successCount = 0
  let failCount = 0
  const errors: string[] = []

  for (const batch of batches) {
    try {
      const arData = await erpAdapter.getARBalances(batch)

      await prisma.$transaction(
        arData.map(ar =>
          prisma.aRCache.upsert({
            where: { customerAcumaticaId: ar.customerId },
            update: {
              totalOutstanding: ar.totalOutstanding,
              totalOverdue: ar.totalOverdue,
              oldestDueDate: ar.oldestDueDate ?? null,
              invoiceCount: ar.invoiceCount,
              arStatus: deriveARStatus(ar.totalOverdue, ar.oldestDueDate),
              syncedAt: new Date(),
              syncJobId: syncJob.id
            },
            create: {
              customerAcumaticaId: ar.customerId,
              totalOutstanding: ar.totalOutstanding,
              totalOverdue: ar.totalOverdue,
              oldestDueDate: ar.oldestDueDate ?? null,
              invoiceCount: ar.invoiceCount,
              arStatus: deriveARStatus(ar.totalOverdue, ar.oldestDueDate),
              syncedAt: new Date(),
              syncJobId: syncJob.id
            }
          })
        )
      )
      successCount += batch.length
    } catch (err: any) {
      failCount += batch.length
      errors.push(err?.message ?? 'Unknown error')
      logger.error({ batch, err }, 'AR sync batch failed')
    }

    // Jeda antar batch — hindari burst Acumatica API
    await new Promise(r => setTimeout(r, 200))
  }

  const finalStatus = failCount === 0 ? 'SUCCESS' : successCount > 0 ? 'PARTIAL' : 'FAILED'

  await prisma.syncJob.update({
    where: { id: syncJob.id },
    data: {
      status: finalStatus,
      totalRecords: customers.length,
      successCount,
      failCount,
      errorSummary: errors.length > 0 ? errors.slice(0, 3).join(' | ') : null,
      finishedAt: new Date()
    }
  })

  logger.info({ syncJobId: syncJob.id, finalStatus, successCount, failCount }, 'AR sync finished')
}
