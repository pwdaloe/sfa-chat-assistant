import { prisma, type Visit, type Prisma } from '@sfa/db'

type VisitWithOrders = Prisma.VisitGetPayload<{
  include: { orders: { select: { id: true; status: true; items: true } } }
}>

type VisitWithOrderStatus = Prisma.VisitGetPayload<{
  include: { orders: { select: { id: true; status: true } } }
}>

export async function createVisit(params: {
  salespersonId: string
  customerAcumaticaId: string
  customerName: string
  gpsLat?: number
  gpsLng?: number
  outOfRoute?: boolean
}): Promise<Visit> {
  return prisma.visit.create({
    data: {
      salespersonId: params.salespersonId,
      customerAcumaticaId: params.customerAcumaticaId,
      customerName: params.customerName,
      checkinAt: new Date(),
      gpsLat: params.gpsLat,
      gpsLng: params.gpsLng,
      outOfRoute: params.outOfRoute ?? false
    }
  })
}

export async function getLastVisit(
  salespersonId: string,
  customerAcumaticaId: string
): Promise<VisitWithOrders | null> {
  return prisma.visit.findFirst({
    where: { salespersonId, customerAcumaticaId },
    orderBy: { checkinAt: 'desc' },
    include: { orders: { select: { id: true, status: true, items: true } } }
  })
}

export async function getTodayVisits(salespersonId: string): Promise<VisitWithOrderStatus[]> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return prisma.visit.findMany({
    where: { salespersonId, checkinAt: { gte: todayStart } },
    orderBy: { checkinAt: 'asc' },
    include: { orders: { select: { id: true, status: true } } }
  })
}

export async function closeVisit(visitId: string, notes?: string): Promise<Visit> {
  return prisma.visit.update({
    where: { id: visitId },
    data: { checkoutAt: new Date(), notes }
  })
}
