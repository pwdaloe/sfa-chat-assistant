import { prisma, type Order } from '@sfa/db'
import type { CartItem } from '@sfa/shared'

export async function createConfirmedOrder(
  visitId: string,
  items: CartItem[]
): Promise<Order> {
  return prisma.order.create({
    data: {
      visitId,
      status: 'CONFIRMED',
      items: {
        create: items.map(item => ({
          skuId: item.skuId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discountPct: item.discountPct
        }))
      }
    }
  })
}

export async function getOrdersByVisit(visitId: string) {
  return prisma.order.findMany({
    where: { visitId },
    include: {
      items: {
        include: { product: { select: { skuName: true, category: true } } }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}

export function calcCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    const discounted = item.unitPrice * (1 - item.discountPct / 100)
    return sum + discounted * item.qty
  }, 0)
}
