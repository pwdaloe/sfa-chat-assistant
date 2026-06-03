import type {
  ERPCustomer, ERPPriceItem, ERPStockItem,
  ERPARBalance, ERPOrderPayload, ERPSalesOrder, ERPProduct
} from './types'

export interface IERPAdapter {
  // Customer
  getCustomersByIds(ids: string[]): Promise<ERPCustomer[]>

  // Product catalog
  getProducts(isActive?: boolean): Promise<ERPProduct[]>

  // Pricelist — batch by customer + skus
  getPricelist(customerId: string, skuIds?: string[]): Promise<ERPPriceItem[]>

  // Inventory stock levels
  getStockLevels(skuIds: string[]): Promise<ERPStockItem[]>

  // AR — batch by customer ids
  getARBalances(customerIds: string[]): Promise<ERPARBalance[]>

  // Sales Order (write — Sprint 5+)
  createSalesOrder(payload: ERPOrderPayload): Promise<ERPSalesOrder>
  getSalesOrderStatus(soNumber: string): Promise<ERPSalesOrder>
}
