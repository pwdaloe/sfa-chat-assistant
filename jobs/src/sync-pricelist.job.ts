import { Job } from 'bullmq'
import { prisma } from '@sfa/db'
import type { IERPAdapter } from '@sfa/erp-adapter'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
const BATCH_SIZE = 20

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  )
}

export async function syncPricelistJob(_job: Job, erpAdapter: IERPAdapter): Promise<void> {
  const syncJob = await prisma.syncJob.create({
    data: { jobType: 'pricelist', status: 'RUNNING' }
  })

  logger.info({ syncJobId: syncJob.id }, 'Pricelist sync started')

  const customers = await prisma.customerAssignment.findMany({
    where: { isActive: true },
    select: { customerAcumaticaId: true },
    distinct: ['customerAcumaticaId']
  })

  let successCount = 0
  let failCount = 0
  const errors: string[] = []

  for (const batch of chunk(customers, BATCH_SIZE)) {
    for (const { customerAcumaticaId } of batch) {
      try {
        const prices = await erpAdapter.getPricelist(customerAcumaticaId)

        await prisma.$transaction(
          prices.map(p =>
            prisma.pricelistCache.upsert({
              where: { customerAcumaticaId_skuId: { customerAcumaticaId, skuId: p.skuId } },
              update: { unitPrice: p.unitPrice, uom: p.uom, validFrom: p.validFrom, validTo: p.validTo, syncedAt: new Date() },
              create: {
                customerAcumaticaId,
                skuId: p.skuId,
                skuName: p.skuName,
                unitPrice: p.unitPrice,
                uom: p.uom,
                validFrom: p.validFrom,
                validTo: p.validTo,
                syncedAt: new Date()
              }
            })
          )
        )
        successCount++
      } catch (err: any) {
        failCount++
        errors.push(`${customerAcumaticaId}: ${err?.message}`)
        logger.error({ customerAcumaticaId, err }, 'Pricelist batch item failed')
      }
      await new Promise(r => setTimeout(r, 100))
    }
  }

  const status = failCount === 0 ? 'SUCCESS' : successCount > 0 ? 'PARTIAL' : 'FAILED'
  await prisma.syncJob.update({
    where: { id: syncJob.id },
    data: { status, totalRecords: customers.length, successCount, failCount, errorSummary: errors.slice(0, 3).join(' | ') || null, finishedAt: new Date() }
  })
  logger.info({ syncJobId: syncJob.id, status, successCount, failCount }, 'Pricelist sync finished')
}
