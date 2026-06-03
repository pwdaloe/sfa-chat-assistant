export interface ERPCustomer {
  id: string
  name: string
  address: string
  phone: string
  gpsLat?: number
  gpsLng?: number
}

export interface ERPPriceItem {
  customerId: string
  skuId: string
  skuName: string
  unitPrice: number
  uom: string
  validFrom?: Date
  validTo?: Date
}

export interface ERPStockItem {
  skuId: string
  skuName: string
  availableQty: number
  uom: string
}

export interface ERPARBalance {
  customerId: string
  totalOutstanding: number
  totalOverdue: number
  oldestDueDate?: Date
  invoiceCount: number
  invoices: ERPInvoice[]
}

export interface ERPInvoice {
  invoiceNumber: string
  invoiceDate: Date
  dueDate: Date
  amount: number
  amountPaid: number
  balance: number
}

export interface ERPOrderPayload {
  externalRef: string
  customerId: string
  orderDate: Date
  description: string
  items: ERPOrderItem[]
}

export interface ERPOrderItem {
  skuId: string
  qty: number
  unitPrice: number
  discountPct: number
  discountCode?: string
}

export interface ERPSalesOrder {
  soNumber: string
  status: string
  customerId: string
  orderDate: Date
  totalAmount: number
}

export interface ERPProduct {
  skuId: string
  skuName: string
  category: string
  isActive: boolean
}
