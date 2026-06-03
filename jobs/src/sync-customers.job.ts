import { Job } from 'bullmq'
import { prisma } from '@sfa/db'
import type { IERPAdapter } from '@sfa/erp-adapter'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

export async function syncCustomersJob(_job: Job, erpAdapter: IERPAdapter): Promise<void> {
  const syncJob = await prisma.syncJob.create({
    data: { jobType: 'customers', status: 'RUNNING' }
  })

  logger.info({ syncJobId: syncJob.id }, 'Customer sync started')

  try {
    // Ambil semua customer dari ERP
    const erpCustomers = await erpAdapter.getProducts(true)
      .then(() => erpAdapter.getCustomersByIds([]))  // getAll — passing empty = fetch all
      .catch(() => {
        logger.warn('ERP unavailable, skipping customer sync')
        return []
      })

    if (erpCustomers.length === 0) {
      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: { status: 'PARTIAL', errorSummary: 'ERP returned 0 customers', finishedAt: new Date() }
      })
      return
    }

    // Update nama & info customer di customer_assignments (bukan create — assignment dikelola manual/admin)
    let successCount = 0
    for (const c of erpCustomers) {
      await prisma.customerAssignment.updateMany({
        where: { customerAcumaticaId: c.id },
        data: {
          customerName: c.name,
          customerAddress: c.address,
          customerPhone: c.phone
        }
      })
      successCount++
    }

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { status: 'SUCCESS', totalRecords: erpCustomers.length, successCount, finishedAt: new Date() }
    })

    logger.info({ syncJobId: syncJob.id, successCount }, 'Customer sync finished')
  } catch (err: any) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { status: 'FAILED', errorSummary: err?.message, finishedAt: new Date() }
    })
    logger.error({ err }, 'Customer sync failed')
  }
}
