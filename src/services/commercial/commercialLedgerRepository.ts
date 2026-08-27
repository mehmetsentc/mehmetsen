import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import {
  commercialAuditEvents,
  commercialLedgerEntries,
  paymentIntents,
  paymentTransactions,
  publisherEarnings,
} from '@/db/schema/commercialLedger'
import { adBookings } from '@/db/schema/advertiserMarketplace'
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

function requireDb() {
  return getDb()
}

function mapIntent(r: typeof paymentIntents.$inferSelect): PaymentIntentRecord {
  return {
    id: r.id,
    bookingId: r.bookingId,
    advertiserId: r.advertiserId,
    publisherId: r.publisherId,
    amountMinor: Number(r.amountMinor),
    currency: r.currency,
    status: r.status as PaymentIntentStatus,
    provider: r.provider as PaymentProviderKind,
    providerReference: r.providerReference,
    idempotencyKey: r.idempotencyKey,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function mapTxn(r: typeof paymentTransactions.$inferSelect): PaymentTransactionRecord {
  return {
    id: r.id,
    paymentIntentId: r.paymentIntentId,
    provider: r.provider as PaymentProviderKind,
    providerTransactionId: r.providerTransactionId,
    transactionType: r.transactionType as PaymentTransactionType,
    status: r.status as PaymentTransactionStatus,
    amountMinor: Number(r.amountMinor),
    currency: r.currency,
    idempotencyKey: r.idempotencyKey,
    metadataJson: r.metadataJson ?? null,
    createdAt: r.createdAt,
  }
}

function mapLedger(r: typeof commercialLedgerEntries.$inferSelect): LedgerEntryRecord {
  return {
    id: r.id,
    transactionId: r.transactionId,
    bookingId: r.bookingId,
    paymentIntentId: r.paymentIntentId,
    accountType: r.accountType as LedgerAccountType,
    accountId: r.accountId,
    entryType: r.entryType as LedgerEntryType,
    amountMinor: Number(r.amountMinor),
    currency: r.currency,
    direction: r.direction as LedgerDirection,
    metadataJson: r.metadataJson ?? null,
    createdAt: r.createdAt,
  }
}

function mapEarning(r: typeof publisherEarnings.$inferSelect): PublisherEarningRecord {
  return {
    id: r.id,
    publisherId: r.publisherId,
    bookingId: r.bookingId,
    paymentIntentId: r.paymentIntentId,
    ledgerTransactionId: r.ledgerTransactionId,
    grossMinor: Number(r.grossMinor),
    netMinor: Number(r.netMinor),
    currency: r.currency,
    status: r.status as PublisherEarningStatus,
    commissionStatus: r.commissionStatus as CommissionStatus,
    releasedAt: r.releasedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function mapBooking(r: typeof adBookings.$inferSelect): AdBookingRecord {
  return {
    id: r.id,
    bookingRequestId: r.bookingRequestId,
    advertiserId: r.advertiserId,
    campaignId: r.campaignId,
    publisherId: r.publisherId,
    inventoryId: r.inventoryId,
    creativeId: r.creativeId,
    creativeSnapshot: r.creativeSnapshot ?? null,
    status: r.status as BookingStatus,
    startAt: r.startAt,
    endAt: r.endAt,
    impressionLimit: r.impressionLimit,
    priceMinor: r.priceMinor == null ? null : Number(r.priceMinor),
    currency: r.currency,
    pricingModelSnapshot: r.pricingModelSnapshot,
    grossAmountMinor: r.grossAmountMinor == null ? null : Number(r.grossAmountMinor),
    platformCommissionRateBps: r.platformCommissionRateBps ?? null,
    platformCommissionMinor:
      r.platformCommissionMinor == null ? null : Number(r.platformCommissionMinor),
    publisherGrossMinor: r.publisherGrossMinor == null ? null : Number(r.publisherGrossMinor),
    publisherNetMinor: r.publisherNetMinor == null ? null : Number(r.publisherNetMinor),
    taxPlaceholderMinor: r.taxPlaceholderMinor == null ? null : Number(r.taxPlaceholderMinor),
    invoiceStatus: r.invoiceStatus ?? null,
    taxProfileId: r.taxProfileId ?? null,
    commercialSnapshotAt: r.commercialSnapshotAt ?? null,
    commercialFrozen: Boolean(r.commercialFrozen),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

const ACTIVE_INTENT: PaymentIntentStatus[] = ['PENDING', 'REQUIRES_PAYMENT', 'PROCESSING']

export class CommercialLedgerRepository {
  async findBooking(bookingId: string): Promise<AdBookingRecord | null> {
    const db = requireDb()
    const rows = await db.select().from(adBookings).where(eq(adBookings.id, bookingId)).limit(1)
    return rows[0] ? mapBooking(rows[0]) : null
  }

  async transitionBookingStatus(
    bookingId: string,
    fromStatuses: BookingStatus[],
    toStatus: BookingStatus
  ): Promise<AdBookingRecord | null> {
    const db = requireDb()
    const updated = await db
      .update(adBookings)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(and(eq(adBookings.id, bookingId), inArray(adBookings.status, fromStatuses)))
      .returning()
    return updated[0] ? mapBooking(updated[0]) : null
  }

  async findActiveIntentForBooking(bookingId: string): Promise<PaymentIntentRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(paymentIntents)
      .where(
        and(eq(paymentIntents.bookingId, bookingId), inArray(paymentIntents.status, ACTIVE_INTENT))
      )
      .limit(1)
    return rows[0] ? mapIntent(rows[0]) : null
  }

  async findIntentById(id: string): Promise<PaymentIntentRecord | null> {
    const db = requireDb()
    const rows = await db.select().from(paymentIntents).where(eq(paymentIntents.id, id)).limit(1)
    return rows[0] ? mapIntent(rows[0]) : null
  }

  async findIntentByIdempotencyKey(key: string): Promise<PaymentIntentRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.idempotencyKey, key))
      .limit(1)
    return rows[0] ? mapIntent(rows[0]) : null
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
    const db = requireDb()
    const now = new Date()
    const id = newCommercialId('pi')
    await db.insert(paymentIntents).values({
      id,
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
    })
    return (await this.findIntentById(id))!
  }

  async updateIntentStatus(
    id: string,
    fromStatuses: PaymentIntentStatus[],
    toStatus: PaymentIntentStatus,
    patch?: { providerReference?: string | null }
  ): Promise<PaymentIntentRecord | null> {
    const db = requireDb()
    const updated = await db
      .update(paymentIntents)
      .set({
        status: toStatus,
        updatedAt: new Date(),
        ...(patch?.providerReference !== undefined
          ? { providerReference: patch.providerReference }
          : {}),
      })
      .where(and(eq(paymentIntents.id, id), inArray(paymentIntents.status, fromStatuses)))
      .returning()
    return updated[0] ? mapIntent(updated[0]) : null
  }

  async findTxnByIdempotencyKey(key: string): Promise<PaymentTransactionRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.idempotencyKey, key))
      .limit(1)
    return rows[0] ? mapTxn(rows[0]) : null
  }

  async findTxnByProviderTxn(
    provider: string,
    providerTransactionId: string
  ): Promise<PaymentTransactionRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.provider, provider),
          eq(paymentTransactions.providerTransactionId, providerTransactionId)
        )
      )
      .limit(1)
    return rows[0] ? mapTxn(rows[0]) : null
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
      const byProvider = await this.findTxnByProviderTxn(input.provider, input.providerTransactionId)
      if (byProvider) return { txn: byProvider, created: false }
    }
    const db = requireDb()
    const id = newCommercialId('ptxn')
    try {
      await db.insert(paymentTransactions).values({
        id,
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
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('unique') || msg.includes('duplicate')) {
        const again =
          (await this.findTxnByIdempotencyKey(input.idempotencyKey)) ||
          (input.providerTransactionId
            ? await this.findTxnByProviderTxn(input.provider, input.providerTransactionId)
            : null)
        if (again) return { txn: again, created: false }
      }
      throw err
    }
    const rows = await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, id)).limit(1)
    return { txn: mapTxn(rows[0]!), created: true }
  }

  async listTxnsForIntent(paymentIntentId: string): Promise<PaymentTransactionRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.paymentIntentId, paymentIntentId))
      .orderBy(asc(paymentTransactions.createdAt))
    return rows.map(mapTxn)
  }

  async listLedgerForBooking(bookingId: string): Promise<LedgerEntryRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(commercialLedgerEntries)
      .where(eq(commercialLedgerEntries.bookingId, bookingId))
      .orderBy(asc(commercialLedgerEntries.createdAt))
    return rows.map(mapLedger)
  }

  async listLedgerForTransaction(transactionId: string): Promise<LedgerEntryRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(commercialLedgerEntries)
      .where(eq(commercialLedgerEntries.transactionId, transactionId))
    return rows.map(mapLedger)
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
    if (entries.length === 0) return []
    const db = requireDb()
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
    await db.insert(commercialLedgerEntries).values(rows)
    return rows.map((r) => ({
      id: r.id,
      transactionId: r.transactionId,
      bookingId: r.bookingId,
      paymentIntentId: r.paymentIntentId,
      accountType: r.accountType as LedgerAccountType,
      accountId: r.accountId,
      entryType: r.entryType as LedgerEntryType,
      amountMinor: Number(r.amountMinor),
      currency: r.currency,
      direction: r.direction as LedgerDirection,
      metadataJson: r.metadataJson,
      createdAt: r.createdAt,
    }))
  }

  async findActiveEarningForBooking(bookingId: string): Promise<PublisherEarningRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(publisherEarnings)
      .where(
        and(
          eq(publisherEarnings.bookingId, bookingId),
          inArray(publisherEarnings.status, ['PENDING', 'AVAILABLE', 'PAID'])
        )
      )
      .limit(1)
    return rows[0] ? mapEarning(rows[0]) : null
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
    const db = requireDb()
    const now = new Date()
    const id = newCommercialId('pearn')
    try {
      await db.insert(publisherEarnings).values({
        id,
        publisherId: input.publisherId,
        bookingId: input.bookingId,
        paymentIntentId: input.paymentIntentId,
        ledgerTransactionId: input.ledgerTransactionId,
        grossMinor: input.grossMinor,
        netMinor: input.netMinor,
        currency: input.currency,
        status: input.status ?? 'PENDING',
        commissionStatus: input.commissionStatus ?? 'PENDING_COMMISSION',
        createdAt: now,
        updatedAt: now,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('unique') || msg.includes('duplicate')) {
        const again = await this.findActiveEarningForBooking(input.bookingId)
        if (again) return { earning: again, created: false }
      }
      throw err
    }
    const rows = await db.select().from(publisherEarnings).where(eq(publisherEarnings.id, id)).limit(1)
    return { earning: mapEarning(rows[0]!), created: true }
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
    const db = requireDb()
    const updated = await db
      .update(publisherEarnings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(publisherEarnings.id, id))
      .returning()
    return updated[0] ? mapEarning(updated[0]) : null
  }

  async listEarningsForPublisher(publisherId: string): Promise<PublisherEarningRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(publisherEarnings)
      .where(eq(publisherEarnings.publisherId, publisherId))
      .orderBy(asc(publisherEarnings.createdAt))
    return rows.map(mapEarning)
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
    const db = requireDb()
    await db.insert(commercialAuditEvents).values({
      id: newCommercialId('caud'),
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      advertiserId: input.advertiserId ?? null,
      publisherId: input.publisherId ?? null,
      bookingId: input.bookingId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload ?? null,
      createdAt: new Date(),
    })
  }

  /** Used by reconcile — count capture ledger posts for booking. */
  async hasPaymentCaptureLedger(bookingId: string): Promise<boolean> {
    const db = requireDb()
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(commercialLedgerEntries)
      .where(
        and(
          eq(commercialLedgerEntries.bookingId, bookingId),
          eq(commercialLedgerEntries.entryType, 'PAYMENT_CAPTURE')
        )
      )
    return Number(rows[0]?.n ?? 0) > 0
  }
}
