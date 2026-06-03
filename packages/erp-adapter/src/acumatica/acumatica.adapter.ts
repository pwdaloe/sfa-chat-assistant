import { IERPAdapter } from '../interface'
import { AcumaticaClient } from './acumatica.client'
import type {
  ERPCustomer, ERPPriceItem, ERPStockItem,
  ERPARBalance, ERPOrderPayload, ERPSalesOrder, ERPProduct
} from '../types'

export class AcumaticaAdapter implements IERPAdapter {
  constructor(private client: AcumaticaClient) {}

  async getCustomersByIds(ids: string[]): Promise<ERPCustomer[]> {
    const filter = ids.map(id => `CustomerID eq '${id}'`).join(' or ')
    const raw = await this.client.get<AcumaticaCustomer[]>(
      '/Customer',
      { $filter: filter, $select: 'CustomerID,CustomerName,AddressLine1,Phone1' }
    )
    return raw.map(c => ({
      id: c.CustomerID.value,
      name: c.CustomerName.value,
      address: c.AddressLine1?.value ?? '',
      phone: c.Phone1?.value ?? ''
    }))
  }

  async getProducts(isActive = true): Promise<ERPProduct[]> {
    const raw = await this.client.get<AcumaticaItem[]>(
      '/InventoryItem',
      {
        $filter: `ItemStatus eq '${isActive ? 'Active' : 'Inactive'}'`,
        $select: 'InventoryID,Description,ItemClass'
      }
    )
    return raw.map(item => ({
      skuId: item.InventoryID.value,
      skuName: item.Description.value,
      category: item.ItemClass?.value ?? 'Lainnya',
      isActive
    }))
  }

  async getPricelist(customerId: string, skuIds?: string[]): Promise<ERPPriceItem[]> {
    let filter = `CustomerID eq '${customerId}'`
    if (skuIds?.length) {
      const skuFilter = skuIds.map(id => `InventoryID eq '${id}'`).join(' or ')
      filter += ` and (${skuFilter})`
    }
    const raw = await this.client.get<AcumaticaPriceRecord[]>(
      '/SalesPricesInquiry',
      { $filter: filter }
    )
    return raw.map(p => ({
      customerId,
      skuId: p.InventoryID.value,
      skuName: p.Description.value,
      unitPrice: p.Price.value,
      uom: p.UOM.value
    }))
  }

  async getStockLevels(skuIds: string[]): Promise<ERPStockItem[]> {
    const filter = skuIds.map(id => `InventoryID eq '${id}'`).join(' or ')
    const raw = await this.client.get<AcumaticaInventorySummary[]>(
      '/InventorySummary',
      { $filter: filter, $select: 'InventoryID,Description,QtyAvailable,BaseUnit' }
    )
    return raw.map(s => ({
      skuId: s.InventoryID.value,
      skuName: s.Description.value,
      availableQty: s.QtyAvailable.value,
      uom: s.BaseUnit.value
    }))
  }

  async getARBalances(customerIds: string[]): Promise<ERPARBalance[]> {
    const filter = customerIds.map(id => `CustomerID eq '${id}'`).join(' or ')
    const raw = await this.client.get<AcumaticaARDocument[]>(
      '/ARDocument',
      {
        $filter: `(${filter}) and Status ne 'Closed'`,
        $select: 'CustomerID,RefNbr,DocDate,DueDate,OrigDocAmt,CuryDocBal'
      }
    )

    const grouped = new Map<string, ERPARBalance>()
    for (const doc of raw) {
      const cid = doc.CustomerID.value
      if (!grouped.has(cid)) {
        grouped.set(cid, {
          customerId: cid,
          totalOutstanding: 0,
          totalOverdue: 0,
          invoiceCount: 0,
          invoices: []
        })
      }
      const entry = grouped.get(cid)!
      const balance = doc.CuryDocBal.value
      const dueDate = new Date(doc.DueDate.value)
      const isOverdue = dueDate < new Date()

      entry.totalOutstanding += balance
      if (isOverdue) entry.totalOverdue += balance
      if (!entry.oldestDueDate || dueDate < entry.oldestDueDate) {
        entry.oldestDueDate = dueDate
      }
      entry.invoiceCount++
      entry.invoices.push({
        invoiceNumber: doc.RefNbr.value,
        invoiceDate: new Date(doc.DocDate.value),
        dueDate,
        amount: doc.OrigDocAmt.value,
        amountPaid: doc.OrigDocAmt.value - balance,
        balance
      })
    }
    return Array.from(grouped.values())
  }

  async createSalesOrder(payload: ERPOrderPayload): Promise<ERPSalesOrder> {
    const body = {
      CustomerID: { value: payload.customerId },
      Description: { value: payload.description },
      ExternalRef: { value: payload.externalRef },
      Details: payload.items.map(item => ({
        InventoryID: { value: item.skuId },
        Quantity: { value: item.qty },
        UnitPrice: { value: item.unitPrice },
        DiscountPercent: { value: item.discountPct }
      }))
    }
    const raw = await this.client.post<AcumaticaSalesOrder>('/SalesOrder', body)
    return {
      soNumber: raw.OrderNbr.value,
      status: raw.Status.value,
      customerId: payload.customerId,
      orderDate: new Date(raw.OrderDate.value),
      totalAmount: raw.OrderTotal.value
    }
  }

  async getSalesOrderStatus(soNumber: string): Promise<ERPSalesOrder> {
    const raw = await this.client.get<AcumaticaSalesOrder>(
      `/SalesOrder/${soNumber}`
    )
    return {
      soNumber: raw.OrderNbr.value,
      status: raw.Status.value,
      customerId: raw.CustomerID.value,
      orderDate: new Date(raw.OrderDate.value),
      totalAmount: raw.OrderTotal.value
    }
  }
}

// ─── Acumatica raw response types (internal) ──────────────────────────────────

interface AcuValue<T> { value: T }

interface AcumaticaCustomer {
  CustomerID: AcuValue<string>
  CustomerName: AcuValue<string>
  AddressLine1?: AcuValue<string>
  Phone1?: AcuValue<string>
}

interface AcumaticaItem {
  InventoryID: AcuValue<string>
  Description: AcuValue<string>
  ItemClass?: AcuValue<string>
}

interface AcumaticaPriceRecord {
  InventoryID: AcuValue<string>
  Description: AcuValue<string>
  Price: AcuValue<number>
  UOM: AcuValue<string>
}

interface AcumaticaInventorySummary {
  InventoryID: AcuValue<string>
  Description: AcuValue<string>
  QtyAvailable: AcuValue<number>
  BaseUnit: AcuValue<string>
}

interface AcumaticaARDocument {
  CustomerID: AcuValue<string>
  RefNbr: AcuValue<string>
  DocDate: AcuValue<string>
  DueDate: AcuValue<string>
  OrigDocAmt: AcuValue<number>
  CuryDocBal: AcuValue<number>
}

interface AcumaticaSalesOrder {
  OrderNbr: AcuValue<string>
  Status: AcuValue<string>
  CustomerID: AcuValue<string>
  OrderDate: AcuValue<string>
  OrderTotal: AcuValue<number>
}
