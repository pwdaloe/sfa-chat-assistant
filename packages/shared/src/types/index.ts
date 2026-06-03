export type Role = 'SALESPERSON' | 'SUPERVISOR' | 'BACKOFFICE'

export type ARStatus = 'CLEAR' | 'WARNING' | 'OVERDUE'

export type OrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'QUEUED_SYNC'
  | 'SYNCED'
  | 'SYNC_FAILED'

export type ApprovalType = 'DISCOUNT' | 'ORDER_EDIT'

export type ApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'

export type SyncJobStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED'

export type VisitFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'

export interface UserContext {
  id: string
  telegramId: bigint
  fullName: string
  role: Role
  supervisorId: string | null
}

export interface CartItem {
  skuId: string
  skuName: string
  qty: number
  unitPrice: number
  discountPct: number
}

export interface OrderPayload {
  visitId: string
  customerId: string
  items: CartItem[]
}
