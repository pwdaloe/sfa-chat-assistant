export * from './types/index'

export const formatRupiah = (amount: number): string =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)

export const DAY_NAMES: Record<number, string> = {
  1: 'Senin', 2: 'Selasa', 3: 'Rabu',
  4: 'Kamis', 5: 'Jumat', 6: 'Sabtu', 7: 'Minggu'
}

export const AR_STATUS_EMOJI: Record<string, string> = {
  CLEAR: '🟢',
  WARNING: '🟡',
  OVERDUE: '🔴'
}
