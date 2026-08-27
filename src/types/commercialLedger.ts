/** Commercial ledger / payment / earnings — Phase P10A (no real card provider). */

export type PaymentProviderKind = 'NONE' | 'TEST'

export type PaymentIntentStatus =
  | 'PENDING'
  | 'REQUIRES_PAYMENT'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'

export type PaymentTransactionType = 'AUTHORIZATION' | 'CAPTURE' | 'REFUND' | 'REVERSAL'

export type PaymentTransactionStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED'

export type LedgerAccountType =
  | 'ADVERTISER_RECEIVABLE'
  | 'PLATFORM_CASH_CLEARING'
  | 'PUBLISHER_PAYABLE'
  | 'PLATFORM_COMMISSION_REVENUE'
  | 'PLATFORM_PENDING_COMMISSION'
  | 'REFUND_LIABILITY'

export type LedgerDirection = 'DEBIT' | 'CREDIT'

export type LedgerEntryType =
  | 'PAYMENT_CAPTURE'
  | 'COMMISSION_PENDING'
  | 'PUBLISHER_EARNING_PENDING'
  | 'REFUND'
  | 'REVERSAL'
  | 'RECONCILE_REPAIR'

export type PublisherEarningStatus = 'PENDING' | 'AVAILABLE' | 'PAID' | 'REVERSED'

export type CommissionStatus = 'PENDING_COMMISSION' | 'EARNED_COMMISSION' | 'REVERSED_COMMISSION'

export type CommercialAuditEventType =
  | 'PAYMENT_INTENT_CREATED'
  | 'PAYMENT_PROCESSING'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'LEDGER_POSTED'
  | 'EARNING_PENDING_CREATED'
  | 'EARNING_RELEASED'
  | 'REFUND_CREATED'
  | 'REFUND_POSTED'
  | 'LEDGER_RECONCILED'

/**
 * Architecture contract (P10A):
 * NaHaber never stores raw card numbers or CVV.
 * Future providers must use hosted/tokenized checkout only.
 */
export const CARD_DATA_POLICY =
  'NO_RAW_CARD_DATA — hosted/tokenized checkout only; CVV/PAN never persisted'

export interface CommercialSnapshot {
  grossAmountMinor: number
  currency: string
  platformCommissionRateBps: number
  platformCommissionMinor: number
  publisherGrossMinor: number
  publisherNetMinor: number
  taxPlaceholderMinor: number | null
}

export interface PaymentIntentRecord {
  id: string
  bookingId: string
  advertiserId: string
  publisherId: string
  amountMinor: number
  currency: string
  status: PaymentIntentStatus
  provider: PaymentProviderKind
  providerReference: string | null
  idempotencyKey: string
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface PaymentTransactionRecord {
  id: string
  paymentIntentId: string
  provider: PaymentProviderKind
  providerTransactionId: string | null
  transactionType: PaymentTransactionType
  status: PaymentTransactionStatus
  amountMinor: number
  currency: string
  idempotencyKey: string
  metadataJson: Record<string, unknown> | null
  createdAt: Date
}

export interface LedgerEntryRecord {
  id: string
  transactionId: string
  bookingId: string
  paymentIntentId: string | null
  accountType: LedgerAccountType
  accountId: string | null
  entryType: LedgerEntryType
  amountMinor: number
  currency: string
  direction: LedgerDirection
  metadataJson: Record<string, unknown> | null
  createdAt: Date
}

export interface PublisherEarningRecord {
  id: string
  publisherId: string
  bookingId: string
  paymentIntentId: string | null
  ledgerTransactionId: string
  grossMinor: number
  netMinor: number
  currency: string
  status: PublisherEarningStatus
  commissionStatus: CommissionStatus
  releasedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface PublisherEarningsTotals {
  pending: number
  available: number
  paid: number
  reversed: number
  currency: string
}

export interface PlatformCommissionTotals {
  pendingCommission: number
  earnedCommission: number
  currency: string
}

export interface FinancialInvariantReport {
  bookingId: string
  paidAmountMinor: number
  ledgerDebitMinor: number
  ledgerCreditMinor: number
  publisherPayableMinor: number
  commissionPendingMinor: number
  refundsMinor: number
  balanced: boolean
  issues: string[]
}

export const PAYMENT_INTENT_ACTIVE_STATUSES: PaymentIntentStatus[] = [
  'PENDING',
  'REQUIRES_PAYMENT',
  'PROCESSING',
]

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Ödeme Bekliyor',
  PAYMENT_PROCESSING: 'Ödeme işleniyor',
  PAID_PENDING_DELIVERY: 'Ödendi — yayın bekleniyor',
  READY: 'Hazır',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal',
  REFUNDED: 'İade edildi',
  EXPIRED: 'Süresi doldu',
}
