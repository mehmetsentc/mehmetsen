import {
  isCommercialLedgerEnabled,
  isPaymentIntentEnabled,
  isPublisherEarningsEnabled,
  isTestPaymentProviderEnabled,
  assertTestPaymentProviderAllowed,
} from '@/lib/commercial/commercialFlags'
import { buildCommercialSnapshot } from '@/lib/commercial/commissionDomain'
import type { CommercialLedgerRepository } from '@/services/commercial/commercialLedgerRepository'
import { LedgerService } from '@/services/commercial/LedgerService'
import { CommercialError } from '@/services/commercial/PaymentIntentService'
import {
  getPaymentProvider,
  type PaymentProvider,
} from '@/services/commercial/PaymentProvider'
import type {
  PaymentIntentRecord,
  PaymentTransactionRecord,
  PublisherEarningRecord,
} from '@/types/commercialLedger'

export class CommercialTransactionService {
  private readonly ledger: LedgerService

  constructor(
    private readonly repo: CommercialLedgerRepository,
    private readonly providerFactory: (kind: 'TEST') => PaymentProvider = () =>
      getPaymentProvider('TEST')
  ) {
    this.ledger = new LedgerService(repo)
  }

  private assertLedger(): void {
    if (!isCommercialLedgerEnabled()) {
      throw new CommercialError('COMMERCIAL_LEDGER_DISABLED', 'FLAG_OFF')
    }
  }

  /**
   * Drive TEST provider success for a payment intent.
   * Posts ledger + publisher earning PENDING + booking → PAID_PENDING_DELIVERY.
   * Idempotent on provider_transaction_id + internal key.
   */
  async processTestPaymentSuccess(input: {
    paymentIntentId: string
    actorUserId: string
    skipProviderCall?: boolean
    providerTransactionId?: string
  }): Promise<{
    intent: PaymentIntentRecord
    txn: PaymentTransactionRecord
    earning: PublisherEarningRecord | null
    ledgerTransactionId: string | null
  }> {
    this.assertLedger()
    if (!isPaymentIntentEnabled()) {
      throw new CommercialError('PAYMENT_INTENT_DISABLED', 'FLAG_OFF')
    }
    assertTestPaymentProviderAllowed()
    if (!isTestPaymentProviderEnabled()) {
      throw new CommercialError('TEST_PAYMENT_PROVIDER_DISABLED', 'FLAG_OFF')
    }

    const intent = await this.repo.findIntentById(input.paymentIntentId)
    if (!intent) throw new CommercialError('NOT_FOUND', 'NOT_FOUND')
    if (intent.provider !== 'TEST' && intent.provider !== 'NONE') {
      throw new CommercialError('UNSUPPORTED_PROVIDER', 'UNSUPPORTED_PROVIDER')
    }

    if (intent.status === 'SUCCEEDED') {
      return this.loadSuccessState(intent)
    }

    let providerTransactionId = input.providerTransactionId
    let providerReference = intent.providerReference

    if (!input.skipProviderCall) {
      const provider = this.providerFactory('TEST')
      const result = await provider.createPayment({
        paymentIntentId: intent.id,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
      })
      if (result.status === 'FAILED') {
        await this.repo.updateIntentStatus(
          intent.id,
          ['PENDING', 'REQUIRES_PAYMENT', 'PROCESSING'],
          'FAILED'
        )
        await this.repo.writeAudit({
          eventType: 'PAYMENT_FAILED',
          actorUserId: input.actorUserId,
          advertiserId: intent.advertiserId,
          publisherId: intent.publisherId,
          bookingId: intent.bookingId,
          entityType: 'payment_intent',
          entityId: intent.id,
        })
        throw new CommercialError('PAYMENT_FAILED', 'PAYMENT_FAILED')
      }
      providerTransactionId = result.providerTransactionId
      providerReference = result.providerReference
    }

    if (!providerTransactionId) {
      providerTransactionId = `test_txn_${intent.id}`
    }

    await this.repo.updateIntentStatus(
      intent.id,
      ['PENDING', 'REQUIRES_PAYMENT', 'PROCESSING', 'FAILED'],
      'PROCESSING',
      { providerReference }
    )
    await this.repo.transitionBookingStatus(
      intent.bookingId,
      ['PENDING_PAYMENT'],
      'PAYMENT_PROCESSING'
    )
    await this.repo.writeAudit({
      eventType: 'PAYMENT_PROCESSING',
      actorUserId: input.actorUserId,
      advertiserId: intent.advertiserId,
      publisherId: intent.publisherId,
      bookingId: intent.bookingId,
      entityType: 'payment_intent',
      entityId: intent.id,
    })

    const { txn, created: txnCreated } = await this.repo.createPaymentTransaction({
      paymentIntentId: intent.id,
      provider: 'TEST',
      providerTransactionId,
      transactionType: 'CAPTURE',
      status: 'SUCCEEDED',
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      idempotencyKey: `capture:${intent.id}:${providerTransactionId}`,
    })

    if (!txnCreated) {
      // Same success event twice — repair ledger if needed, no duplicate posts.
      const repaired = await this.reconcileBookingLedger(intent.bookingId, intent.id, input.actorUserId)
      const fresh = await this.loadSuccessState(intent)
      return { ...fresh, ledgerTransactionId: repaired.ledgerTransactionId ?? fresh.ledgerTransactionId }
    }

    const posted = await this.postSuccessFinancials(intent, txn, input.actorUserId)

    const succeeded = await this.repo.updateIntentStatus(
      intent.id,
      ['PROCESSING', 'PENDING', 'REQUIRES_PAYMENT'],
      'SUCCEEDED',
      { providerReference }
    )

    await this.repo.transitionBookingStatus(
      intent.bookingId,
      ['PENDING_PAYMENT', 'PAYMENT_PROCESSING'],
      'PAID_PENDING_DELIVERY'
    )

    await this.repo.writeAudit({
      eventType: 'PAYMENT_SUCCEEDED',
      actorUserId: input.actorUserId,
      advertiserId: intent.advertiserId,
      publisherId: intent.publisherId,
      bookingId: intent.bookingId,
      entityType: 'payment_intent',
      entityId: intent.id,
      payload: { amountMinor: intent.amountMinor, txnId: txn.id },
    })

    return {
      intent: succeeded ?? (await this.repo.findIntentById(intent.id))!,
      txn,
      earning: posted.earning,
      ledgerTransactionId: posted.ledgerTransactionId,
    }
  }

  private async loadSuccessState(intent: PaymentIntentRecord) {
    await this.reconcileBookingLedger(intent.bookingId, intent.id, 'system')
    const txns = await this.repo.listTxnsForIntent(intent.id)
    const capture = txns.find((t) => t.transactionType === 'CAPTURE' && t.status === 'SUCCEEDED')
    const earning = await this.repo.findActiveEarningForBooking(intent.bookingId)
    const entries = await this.repo.listLedgerForBooking(intent.bookingId)
    const ledgerTransactionId =
      entries.find((e) => e.entryType === 'PAYMENT_CAPTURE')?.transactionId ?? null
    return {
      intent: (await this.repo.findIntentById(intent.id))!,
      txn: capture!,
      earning,
      ledgerTransactionId,
    }
  }

  async postSuccessFinancials(
    intent: PaymentIntentRecord,
    txn: PaymentTransactionRecord,
    actorUserId: string
  ): Promise<{ earning: PublisherEarningRecord | null; ledgerTransactionId: string }> {
    const booking = await this.repo.findBooking(intent.bookingId)
    if (!booking) throw new CommercialError('BOOKING_NOT_FOUND', 'NOT_FOUND')

    const snap =
      booking.commercialFrozen &&
      booking.grossAmountMinor != null &&
      booking.publisherNetMinor != null &&
      booking.platformCommissionMinor != null
        ? {
            grossAmountMinor: booking.grossAmountMinor,
            platformCommissionMinor: booking.platformCommissionMinor,
            publisherNetMinor: booking.publisherNetMinor,
          }
        : (() => {
            const s = buildCommercialSnapshot(intent.amountMinor, intent.currency)
            return {
              grossAmountMinor: s.grossAmountMinor,
              platformCommissionMinor: s.platformCommissionMinor,
              publisherNetMinor: s.publisherNetMinor,
            }
          })()

    if (await this.repo.hasPaymentCaptureLedger(intent.bookingId)) {
      const earning = await this.repo.findActiveEarningForBooking(intent.bookingId)
      const entries = await this.repo.listLedgerForBooking(intent.bookingId)
      const txnId = entries.find((e) => e.entryType === 'PAYMENT_CAPTURE')!.transactionId
      return { earning, ledgerTransactionId: txnId }
    }

    const lines = this.ledger.buildPaymentSuccessLines({
      grossMinor: snap.grossAmountMinor,
      publisherNetMinor: snap.publisherNetMinor,
      commissionMinor: snap.platformCommissionMinor,
      publisherId: intent.publisherId,
      advertiserId: intent.advertiserId,
    })

    const { transactionId } = await this.ledger.postBalancedEntries({
      bookingId: intent.bookingId,
      paymentIntentId: intent.id,
      currency: intent.currency,
      lines,
    })

    await this.repo.writeAudit({
      eventType: 'LEDGER_POSTED',
      actorUserId,
      advertiserId: intent.advertiserId,
      publisherId: intent.publisherId,
      bookingId: intent.bookingId,
      entityType: 'ledger_transaction',
      entityId: transactionId,
      payload: { paymentTxnId: txn.id },
    })

    const created = await this.repo.createPublisherEarning({
      publisherId: intent.publisherId,
      bookingId: intent.bookingId,
      paymentIntentId: intent.id,
      ledgerTransactionId: transactionId,
      grossMinor: snap.grossAmountMinor,
      netMinor: snap.publisherNetMinor,
      currency: intent.currency,
      status: 'PENDING',
      commissionStatus: 'PENDING_COMMISSION',
    })
    if (created.created) {
      await this.repo.writeAudit({
        eventType: 'EARNING_PENDING_CREATED',
        actorUserId,
        publisherId: intent.publisherId,
        bookingId: intent.bookingId,
        entityType: 'publisher_earning',
        entityId: created.earning.id,
      })
    }

    return { earning: created.earning, ledgerTransactionId: transactionId }
  }

  /**
   * Spec: reconcileBookingLedger(bookingId) — detect payment succeeded but ledger missing.
   * Bounded/idempotent repair. Requires intentId when available for accurate capture linkage.
   */
  async reconcileBookingLedger(
    bookingId: string,
    intentId: string | null,
    actorUserId: string
  ): Promise<{ repaired: boolean; ledgerTransactionId: string | null }> {
    this.assertLedger()
    const booking = await this.repo.findBooking(bookingId)
    if (!booking) throw new CommercialError('NOT_FOUND', 'NOT_FOUND')

    if (await this.repo.hasPaymentCaptureLedger(bookingId)) {
      if (booking.status === 'PENDING_PAYMENT' || booking.status === 'PAYMENT_PROCESSING') {
        await this.repo.transitionBookingStatus(
          bookingId,
          ['PENDING_PAYMENT', 'PAYMENT_PROCESSING'],
          'PAID_PENDING_DELIVERY'
        )
      }
      const earning = await this.repo.findActiveEarningForBooking(bookingId)
      if (!earning && intentId) {
        const intent = await this.repo.findIntentById(intentId)
        if (intent) {
          const entries = await this.repo.listLedgerForBooking(bookingId)
          const txnId = entries.find((e) => e.entryType === 'PAYMENT_CAPTURE')!.transactionId
          await this.repo.createPublisherEarning({
            publisherId: intent.publisherId,
            bookingId,
            paymentIntentId: intent.id,
            ledgerTransactionId: txnId,
            grossMinor: booking.grossAmountMinor ?? intent.amountMinor,
            netMinor: booking.publisherNetMinor ?? intent.amountMinor,
            currency: intent.currency,
            status: 'PENDING',
            commissionStatus: 'PENDING_COMMISSION',
          })
          return { repaired: true, ledgerTransactionId: txnId }
        }
      }
      return { repaired: false, ledgerTransactionId: null }
    }

    if (!intentId) {
      return { repaired: false, ledgerTransactionId: null }
    }

    const intent = await this.repo.findIntentById(intentId)
    if (!intent || intent.bookingId !== bookingId) {
      throw new CommercialError('NOT_FOUND', 'NOT_FOUND')
    }
    if (intent.status !== 'SUCCEEDED' && intent.status !== 'PROCESSING') {
      return { repaired: false, ledgerTransactionId: null }
    }

    const txns = await this.repo.listTxnsForIntent(intent.id)
    let capture = txns.find((t) => t.transactionType === 'CAPTURE' && t.status === 'SUCCEEDED')
    if (!capture) {
      const created = await this.repo.createPaymentTransaction({
        paymentIntentId: intent.id,
        provider: intent.provider === 'TEST' ? 'TEST' : 'NONE',
        providerTransactionId: intent.providerReference ?? `reconcile_${intent.id}`,
        transactionType: 'CAPTURE',
        status: 'SUCCEEDED',
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        idempotencyKey: `capture:reconcile:${intent.id}`,
      })
      capture = created.txn
    }

    const posted = await this.postSuccessFinancials(intent, capture, actorUserId)
    await this.repo.transitionBookingStatus(
      bookingId,
      ['PENDING_PAYMENT', 'PAYMENT_PROCESSING'],
      'PAID_PENDING_DELIVERY'
    )
    if (intent.status !== 'SUCCEEDED') {
      await this.repo.updateIntentStatus(
        intent.id,
        ['PROCESSING', 'PENDING', 'REQUIRES_PAYMENT'],
        'SUCCEEDED'
      )
    }
    await this.repo.writeAudit({
      eventType: 'LEDGER_RECONCILED',
      actorUserId,
      advertiserId: intent.advertiserId,
      publisherId: intent.publisherId,
      bookingId,
      entityType: 'payment_intent',
      entityId: intent.id,
      payload: { ledgerTransactionId: posted.ledgerTransactionId },
    })
    return { repaired: true, ledgerTransactionId: posted.ledgerTransactionId }
  }

  /** Publisher earnings totals — gated by PUBLISHER_EARNINGS_ENABLED for studio. */
  async getPublisherEarningsTotals(publisherId: string) {
    if (!isPublisherEarningsEnabled() && process.env.NODE_ENV === 'production') {
      return { pending: 0, available: 0, paid: 0, reversed: 0, currency: 'TRY' }
    }
    const rows = await this.repo.listEarningsForPublisher(publisherId)
    const totals = { pending: 0, available: 0, paid: 0, reversed: 0, currency: 'TRY' }
    for (const r of rows) {
      totals.currency = r.currency
      if (r.status === 'PENDING') totals.pending += r.netMinor
      else if (r.status === 'AVAILABLE') totals.available += r.netMinor
      else if (r.status === 'PAID') totals.paid += r.netMinor
      else if (r.status === 'REVERSED') totals.reversed += r.netMinor
    }
    return totals
  }
}
