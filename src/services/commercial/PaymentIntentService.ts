import {
  isCommercialLedgerEnabled,
  isPaymentIntentEnabled,
  isTestPaymentProviderEnabled,
} from '@/lib/commercial/commercialFlags'
import { assertIntegerMinor, buildCommercialSnapshot } from '@/lib/commercial/commissionDomain'
import type { CommercialLedgerRepository } from '@/services/commercial/commercialLedgerRepository'
import type {
  PaymentIntentRecord,
  PaymentProviderKind,
} from '@/types/commercialLedger'
import type { AdBookingRecord } from '@/types/advertiserMarketplace'

export class CommercialError extends Error {
  constructor(
    message: string,
    readonly code: string = 'COMMERCIAL_ERROR'
  ) {
    super(message)
    this.name = 'CommercialError'
  }
}

export class PaymentIntentService {
  constructor(private readonly repo: CommercialLedgerRepository) {}

  private assertFlags(): void {
    if (!isCommercialLedgerEnabled() || !isPaymentIntentEnabled()) {
      throw new CommercialError('PAYMENT_INTENT_DISABLED', 'FLAG_OFF')
    }
  }

  /**
   * Create payment intent from booking commercial snapshot.
   * Client-supplied amount/commission/net are IGNORED.
   */
  async createForBooking(input: {
    booking: AdBookingRecord
    advertiserId: string
    actorUserId: string
    /** Ignored — server computes from snapshot. */
    clientAmountMinor?: unknown
    clientCommission?: unknown
    preferredProvider?: PaymentProviderKind
  }): Promise<PaymentIntentRecord> {
    this.assertFlags()
    if (input.booking.advertiserId !== input.advertiserId) {
      throw new CommercialError('FORBIDDEN', 'FORBIDDEN')
    }
    if (input.booking.status !== 'PENDING_PAYMENT') {
      throw new CommercialError('BOOKING_NOT_PENDING_PAYMENT', 'INVALID_STATE')
    }

    const active = await this.repo.findActiveIntentForBooking(input.booking.id)
    if (active) return active

    const amountMinor = this.resolveAmountFromBooking(input.booking)
    const currency = input.booking.currency || 'TRY'

    let provider: PaymentProviderKind = 'NONE'
    if (input.preferredProvider === 'TEST' && isTestPaymentProviderEnabled()) {
      provider = 'TEST'
    }

    const idempotencyKey = `pi_create:${input.booking.id}:${amountMinor}:${currency}`
    const existingKey = await this.repo.findIntentByIdempotencyKey(idempotencyKey)
    if (existingKey) return existingKey

    const intent = await this.repo.createPaymentIntent({
      bookingId: input.booking.id,
      advertiserId: input.booking.advertiserId,
      publisherId: input.booking.publisherId,
      amountMinor,
      currency,
      status: provider === 'NONE' ? 'REQUIRES_PAYMENT' : 'PENDING',
      provider,
      idempotencyKey,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })

    await this.repo.writeAudit({
      eventType: 'PAYMENT_INTENT_CREATED',
      actorUserId: input.actorUserId,
      advertiserId: input.booking.advertiserId,
      publisherId: input.booking.publisherId,
      bookingId: input.booking.id,
      entityType: 'payment_intent',
      entityId: intent.id,
      payload: { amountMinor, currency, provider },
    })

    return intent
  }

  resolveAmountFromBooking(booking: AdBookingRecord): number {
    if (booking.commercialFrozen && booking.grossAmountMinor != null) {
      return assertIntegerMinor(booking.grossAmountMinor)
    }
    if (booking.priceMinor == null) {
      throw new CommercialError('BOOKING_HAS_NO_PRICE', 'NO_PRICE')
    }
    const snap = buildCommercialSnapshot(booking.priceMinor, booking.currency)
    return snap.grossAmountMinor
  }

  async cancelIntent(
    intentId: string,
    actorUserId: string
  ): Promise<PaymentIntentRecord> {
    this.assertFlags()
    const intent = await this.repo.findIntentById(intentId)
    if (!intent) throw new CommercialError('NOT_FOUND', 'NOT_FOUND')
    const updated = await this.repo.updateIntentStatus(
      intentId,
      ['PENDING', 'REQUIRES_PAYMENT'],
      'CANCELLED'
    )
    if (!updated) throw new CommercialError('ALREADY_PROCESSED', 'ALREADY_PROCESSED')
    await this.repo.writeAudit({
      eventType: 'PAYMENT_FAILED',
      actorUserId,
      advertiserId: intent.advertiserId,
      publisherId: intent.publisherId,
      bookingId: intent.bookingId,
      entityType: 'payment_intent',
      entityId: intent.id,
      payload: { reason: 'CANCELLED' },
    })
    return updated
  }
}
