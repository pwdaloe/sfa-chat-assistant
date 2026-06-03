import { Job } from 'bullmq'
import { prisma } from '@sfa/db'
import type { IERPAdapter } from '@sfa/erp-adapter'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

export async function syncProductsJob(_job: Job, erpAdapter: IERPAdapter): Promise<void> {
  const syncJob = await prisma.syncJob.create({
    data: { jobType: 'products', status: 'RUNNING' }
  })

  logger.info({ syncJobId: syncJob.id }, 'Products sync started')

  try {
    const products = await erpAdapter.getProducts(true)

    await prisma.$transaction(
      products.map(p =>
        prisma.product.upsert({
          where: { skuId: p.skuId },
          update: { skuName: p.skuName, category: p.category, isActive: p.isActive, syncedAt: new Date() },
          create: { skuId: p.skuId, skuName: p.skuName, category: p.category, isActive: p.isActive, syncedAt: new Date() }
        })
      )
    )

    // Nonaktifkan produk yang tidak ada di ERP
    const erpSkuIds = products.map(p => p.skuId)
    await prisma.product.updateMany({
      where: { skuId: { notIn: erpSkuIds }, isActive: true },
      data: { isActive: false }
    })

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { status: 'SUCCESS', totalRecords: products.length, successCount: products.length, failCount: 0, finishedAt: new Date() }
    })
    logger.info({ syncJobId: syncJob.id, count: products.length }, 'Products sync finished')
  } catch (err: any) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { status: 'FAILED', errorSummary: err?.message, finishedAt: new Date() }
    })
    logger.error({ err }, 'Products sync failed')
  }
}
