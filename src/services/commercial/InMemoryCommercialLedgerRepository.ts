/**
 * In-memory commercial ledger store for unit tests (no DB).
 * Mirrors CommercialLedgerRepository surface used by P10A services.
 */
import { newCommercialId } from '@/lib/commercial/id'
import type {
  CommercialAuditEventType,
  CommissionStatus,
  LedgerAccountType,
  LedgerDirection,
  LedgerEntryRecord,
  LedgerEntryType,
  PaymentIntentRecord,
  PaymentIntentStatus,
  PaymentProviderKind,
  PaymentTransactionRecord,
  PaymentTransactionStatus,
  PaymentTransactionType,
  PublisherEarningRecord,
  PublisherEarningStatus,
} from '@/types/commercialLedger'
import type { AdBookingRecord, BookingStatus } from '@/types/advertiserMarketplace'
import type { CommercialLedgerRepository } from '@/services/commercial/commercialLedgerRepository'

const ACTIVE_INTENT: PaymentIntentStatus[] = ['PENDING', 'REQUIRES_PAYMENT', 'PROCESSING']

export class InMemoryCommercialLedgerRepository
  implements Pick<
    CommercialLedgerRepository,
    | 'findBooking'
    | 'transitionBookingStatus'
    | 'findActiveIntentForBooking'
    | 'findIntentById'
    | 'findIntentByIdempotencyKey'
    | 'createPaymentIntent'
    | 'updateIntentStatus'
    | 'findTxnByIdempotencyKey'
    | 'findTxnByProviderTxn'
    | 'createPaymentTransaction'
    | 'listTxnsForIntent'
    | 'listLedgerForBooking'
    | 'listLedgerForTransaction'
    | 'insertLedgerEntries'
    | 'findActiveEarningForBooking'
    | 'createPublisherEarning'
    | 'updateEarning'
    | 'listEarningsForPublisher'
    | 'sumRefundsForIntent'
    | 'writeAudit'
    | 'hasPaymentCaptureLedger'
  >
{
  bookings = new Map<string, AdBookingRecord>()
  intents = new Map<string, PaymentIntentRecord>()
  txns = new Map<string, PaymentTransactionRecord>()
  ledger: LedgerEntryRecord[] = []
  earnings = new Map<string, PublisherEarningRecord>()
  audits: Array<{ eventType: CommercialAuditEventType; payload?: unknown }> = []

  seedBooking(b: AdBookingRecord): void {
    this.bookings.set(b.id, { ...b })
  }

  async findBooking(bookingId: string): Promise<AdBookingRecord | null> {
    return this.bookings.get(bookingId) ?? null
  }

  async transitionBookingStatus(
    bookingId: string,
    fromStatuses: BookingStatus[],
    toStatus: BookingStatus
  ): Promise<AdBookingRecord | null> {
    const b = this.bookings.get(bookingId)
    if (!b || !fromStatuses.includes(b.status)) return null
    const next = { ...b, status: toStatus, updatedAt: new Date() }
    this.bookings.set(bookingId, next)
    return next
  }

  async findActiveIntentForBooking(bookingId: string): Promise<PaymentIntentRecord | null> {
    for (const i of this.intents.values()) {
      if (i.bookingId === bookingId && ACTIVE_INTENT.includes(i.status)) return i
    }
    return null
  }

  async findIntentById(id: string): Promise<PaymentIntentRecord | null> {
    return this.intents.get(id) ?? null
  }

  async findIntentByIdempotencyKey(key: string): Promise<PaymentIntentRecord | null> {
    for (const i of this.intents.values()) {
      if (i.idempotencyKey === key) return i
    }
    return null
  }

  async createPaymentIntent(input: {
    bookingId: string
    advertiserId: string
    publisherId: string
    amountMinor: number
    currency: string
    status: PaymentIntentStatus
    provider: PaymentProviderKind
    providerReference?: string | null
    idempotencyKey: string
    expiresAt?: Date | null
  }): Promise<PaymentIntentRecord> {
    const active = await this.findActiveIntentForBooking(input.bookingId)
    if (active) throw new Error('unique payment_intents_one_active_booking_uidx')
    const now = new Date()
    const intent: PaymentIntentRecord = {
      id: newCommercialId('pi'),
      bookingId: input.bookingId,
      advertiserId: input.advertiserId,
      publisherId: input.publisherId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: input.status,
      provider: input.provider,
      providerReference: input.providerReference ?? null,
      idempotencyKey: input.idempotencyKey,
      expiresAt: input.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    }
    this.intents.set(intent.id, intent)
    return intent
  }

  async updateIntentStatus(
    id: string,
    fromStatuses: PaymentIntentStatus[],
    toStatus: PaymentIntentStatus,
    patch?: { providerReference?: string | null }
  ): Promise<PaymentIntentRecord | null> {
    const i = this.intents.get(id)
    if (!i || !fromStatuses.includes(i.status)) return null
    const next: PaymentIntentRecord = {
      ...i,
      status: toStatus,
      updatedAt: new Date(),
      providerReference:
        patch?.providerReference !== undefined ? patch.providerReference : i.providerReference,
    }
    this.intents.set(id, next)
    return next
  }

  async findTxnByIdempotencyKey(key: string): Promise<PaymentTransactionRecord | null> {
    for (const t of this.txns.values()) {
      if (t.idempotencyKey === key) return t
    }
    return null
  }

  async findTxnByProviderTxn(
    provider: string,
    providerTransactionId: string
  ): Promise<PaymentTransactionRecord | null> {
    for (const t of this.txns.values()) {
      if (t.provider === provider && t.providerTransactionId === providerTransactionId) return t
    }
    return null
  }

  async createPaymentTransaction(input: {
    paymentIntentId: string
    provider: PaymentProviderKind
    providerTransactionId: string | null
    transactionType: PaymentTransactionType
    status: PaymentTransactionStatus
    amountMinor: number
    currency: string
    idempotencyKey: string
    metadataJson?: Record<string, unknown> | null
  }): Promise<{ txn: PaymentTransactionRecord; created: boolean }> {
    const existing = await this.findTxnByIdempotencyKey(input.idempotencyKey)
    if (existing) return { txn: existing, created: false }
    if (input.providerTransactionId) {
      const byP = await this.findTxnByProviderTxn(input.provider, input.providerTransactionId)
      if (byP) return { txn: byP, created: false }
    }
    const txn: PaymentTransactionRecord = {
      id: newCommercialId('ptxn'),
      paymentIntentId: input.paymentIntentId,
      provider: input.provider,
      providerTransactionId: input.providerTransactionId,
      transactionType: input.transactionType,
      status: input.status,
      amountMinor: input.amountMinor,
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
      metadataJson: input.metadataJson ?? null,
      createdAt: new Date(),
    }
    this.txns.set(txn.id, txn)
    return { txn, created: true }
  }

  async listTxnsForIntent(paymentIntentId: string): Promise<PaymentTransactionRecord[]> {
    return [...this.txns.values()].filter((t) => t.paymentIntentId === paymentIntentId)
  }

  async listLedgerForBooking(bookingId: string): Promise<LedgerEntryRecord[]> {
    return this.ledger.filter((e) => e.bookingId === bookingId)
  }

  async listLedgerForTransaction(transactionId: string): Promise<LedgerEntryRecord[]> {
    return this.ledger.filter((e) => e.transactionId === transactionId)
  }

  async insertLedgerEntries(
    entries: Array<{
      transactionId: string
      bookingId: string
      paymentIntentId: string | null
      accountType: LedgerAccountType
      accountId: string | null
      entryType: LedgerEntryType
      amountMinor: number
      currency: string
      direction: LedgerDirection
      metadataJson?: Record<string, unknown> | null
    }>
  ): Promise<LedgerEntryRecord[]> {
    const now = new Date()
    const rows = entries.map((e) => ({
      id: newCommercialId('cle'),
      transactionId: e.transactionId,
      bookingId: e.bookingId,
      paymentIntentId: e.paymentIntentId,
      accountType: e.accountType,
      accountId: e.accountId,
      entryType: e.entryType,
      amountMinor: e.amountMinor,
      currency: e.currency,
      direction: e.direction,
      metadataJson: e.metadataJson ?? null,
      createdAt: now,
    }))
    this.ledger.push(...rows)
    return rows
  }

  async findActiveEarningForBooking(bookingId: string): Promise<PublisherEarningRecord | null> {
    for (const e of this.earnings.values()) {
      if (
        e.bookingId === bookingId &&
        (e.status === 'PENDING' || e.status === 'AVAILABLE' || e.status === 'PAID')
      ) {
        return e
      }
    }
    return null
  }

  async createPublisherEarning(input: {
    publisherId: string
    bookingId: string
    paymentIntentId: string | null
    ledgerTransactionId: string
    grossMinor: number
    netMinor: number
    currency: string
    status?: PublisherEarningStatus
    commissionStatus?: CommissionStatus
  }): Promise<{ earning: PublisherEarningRecord; created: boolean }> {
    const existing = await this.findActiveEarningForBooking(input.bookingId)
    if (existing) return { earning: existing, created: false }
    const now = new Date()
    const earning: PublisherEarningRecord = {
      id: newCommercialId('pearn'),
      publisherId: input.publisherId,
      bookingId: input.bookingId,
      paymentIntentId: input.paymentIntentId,
      ledgerTransactionId: input.ledgerTransactionId,
      grossMinor: input.grossMinor,
      netMinor: input.netMinor,
      currency: input.currency,
      status: input.status ?? 'PENDING',
      commissionStatus: input.commissionStatus ?? 'PENDING_COMMISSION',
      releasedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.earnings.set(earning.id, earning)
    return { earning, created: true }
  }

  async updateEarning(
    id: string,
    patch: {
      status?: PublisherEarningStatus
      commissionStatus?: CommissionStatus
      netMinor?: number
      grossMinor?: number
      releasedAt?: Date | null
    }
  ): Promise<PublisherEarningRecord | null> {
    const e = this.earnings.get(id)
    if (!e) return null
    const next = { ...e, ...patch, updatedAt: new Date() }
    this.earnings.set(id, next)
    return next
  }

  async listEarningsForPublisher(publisherId: string): Promise<PublisherEarningRecord[]> {
    return [...this.earnings.values()].filter((e) => e.publisherId === publisherId)
  }

  async sumRefundsForIntent(paymentIntentId: string): Promise<number> {
    const txns = await this.listTxnsForIntent(paymentIntentId)
    return txns
      .filter((t) => t.transactionType === 'REFUND' && t.status === 'SUCCEEDED')
      .reduce((s, t) => s + t.amountMinor, 0)
  }

  async writeAudit(input: {
    eventType: CommercialAuditEventType
    actorUserId?: string | null
    advertiserId?: string | null
    publisherId?: string | null
    bookingId?: string | null
    entityType?: string | null
    entityId?: string | null
    payload?: Record<string, unknown> | null
  }): Promise<void> {
    this.audits.push({ eventType: input.eventType, payload: input.payload })
  }

  async hasPaymentCaptureLedger(bookingId: string): Promise<boolean> {
    return this.ledger.some(
      (e) => e.bookingId === bookingId && e.entryType === 'PAYMENT_CAPTURE'
    )
  }
}
