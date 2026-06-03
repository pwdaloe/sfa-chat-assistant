import { prisma } from '@sfa/db'

export async function getCategories(): Promise<string[]> {
  const result = await prisma.product.findMany({
    where: { isActive: true },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' }
  })
  return result.map(r => r.category)
}

export async function getProductsByCategory(category: string) {
  return prisma.product.findMany({
    where: { category, isActive: true },
    orderBy: { skuName: 'asc' }
  })
}

export async function getPriceForCustomer(
  customerAcumaticaId: string,
  skuId: string
): Promise<number | null> {
  const entry = await prisma.pricelistCache.findUnique({
    where: { customerAcumaticaId_skuId: { customerAcumaticaId, skuId } }
  })
  return entry ? Number(entry.unitPrice) : null
}

export async function getPricelistForCustomer(
  customerAcumaticaId: string
): Promise<Record<string, number>> {
  const entries = await prisma.pricelistCache.findMany({
    where: { customerAcumaticaId }
  })
  return Object.fromEntries(entries.map(e => [e.skuId, Number(e.unitPrice)]))
}
