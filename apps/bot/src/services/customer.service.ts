import { prisma } from '@sfa/db'

export interface RouteCustomer {
  customerAcumaticaId: string
  customerName: string
  customerAddress: string
  customerPhone: string
  visitSequence: number
  lastVisitDate: Date | null
  visitedToday: boolean
  gpsLat: number | null
  gpsLng: number | null
  outOfRoute: boolean
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function todayStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function getTodayRoute(salespersonId: string): Promise<RouteCustomer[]> {
  const dayOfWeek = new Date().getDay() || 7 // 1=Mon ... 7=Sun

  const routes = await prisma.route.findMany({
    where: { salespersonId, customerAssignment: { isActive: true } },
    include: { customerAssignment: true },
    orderBy: { visitSequence: 'asc' }
  })

  // Filter by day (WEEKLY: every week, BIWEEKLY/MONTHLY: simplified — tampilkan semua)
  const todayRoutes = routes.filter(r => r.dayOfWeek === dayOfWeek)

  return Promise.all(todayRoutes.map(async (r) => {
    const ca = r.customerAssignment

    const lastVisit = await prisma.visit.findFirst({
      where: { salespersonId, customerAcumaticaId: ca.customerAcumaticaId },
      orderBy: { checkinAt: 'desc' }
    })

    const todayVisit = await prisma.visit.findFirst({
      where: {
        salespersonId,
        customerAcumaticaId: ca.customerAcumaticaId,
        checkinAt: { gte: todayStart() }
      }
    })

    return {
      customerAcumaticaId: ca.customerAcumaticaId,
      customerName: ca.customerName,
      customerAddress: ca.customerAddress ?? '',
      customerPhone: ca.customerPhone ?? '',
      visitSequence: r.visitSequence,
      lastVisitDate: lastVisit?.checkinAt ?? null,
      visitedToday: !!todayVisit,
      gpsLat: ca.gpsLat ? Number(ca.gpsLat) : null,
      gpsLng: ca.gpsLng ? Number(ca.gpsLng) : null,
      outOfRoute: false
    }
  }))
}

export async function searchCustomers(salespersonId: string, query: string): Promise<RouteCustomer[]> {
  const results = await prisma.customerAssignment.findMany({
    where: {
      salespersonId,
      isActive: true,
      customerName: { contains: query, mode: 'insensitive' }
    },
    take: 8
  })

  return results.map(ca => ({
    customerAcumaticaId: ca.customerAcumaticaId,
    customerName: ca.customerName,
    customerAddress: ca.customerAddress ?? '',
    customerPhone: ca.customerPhone ?? '',
    visitSequence: 0,
    lastVisitDate: null,
    visitedToday: false,
    gpsLat: ca.gpsLat ? Number(ca.gpsLat) : null,
    gpsLng: ca.gpsLng ? Number(ca.gpsLng) : null,
    outOfRoute: false
  }))
}

export async function getNearbyCustomers(
  salespersonId: string,
  lat: number,
  lng: number,
  maxDistanceMeters = 500
): Promise<(RouteCustomer & { distanceM: number })[]> {
  const all = await prisma.customerAssignment.findMany({
    where: { salespersonId, isActive: true, gpsLat: { not: null }, gpsLng: { not: null } }
  })

  const withDistance = all
    .map(ca => ({
      customerAcumaticaId: ca.customerAcumaticaId,
      customerName: ca.customerName,
      customerAddress: ca.customerAddress ?? '',
      customerPhone: ca.customerPhone ?? '',
      visitSequence: 0,
      lastVisitDate: null,
      visitedToday: false,
      gpsLat: Number(ca.gpsLat),
      gpsLng: Number(ca.gpsLng),
      outOfRoute: false,
      distanceM: haversineMeters(lat, lng, Number(ca.gpsLat), Number(ca.gpsLng))
    }))
    .filter(c => c.distanceM <= maxDistanceMeters)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 5)

  // Jika tidak ada dalam radius, tampilkan 5 terdekat tanpa filter jarak
  if (withDistance.length === 0) {
    return all
      .map(ca => ({
        customerAcumaticaId: ca.customerAcumaticaId,
        customerName: ca.customerName,
        customerAddress: ca.customerAddress ?? '',
        customerPhone: ca.customerPhone ?? '',
        visitSequence: 0,
        lastVisitDate: null,
        visitedToday: false,
        gpsLat: Number(ca.gpsLat),
        gpsLng: Number(ca.gpsLng),
        outOfRoute: true,
        distanceM: haversineMeters(lat, lng, Number(ca.gpsLat), Number(ca.gpsLng))
      }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 5)
  }
  return withDistance
}

export async function getCustomerARInfo(customerAcumaticaId: string) {
  return prisma.aRCache.findUnique({ where: { customerAcumaticaId } })
}
