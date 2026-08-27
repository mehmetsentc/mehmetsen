import { isCommercialLedgerEnabled } from '@/lib/commercial/commercialFlags'
import { assertIntegerMinor, proportionalRefundSplit } from '@/lib/commercial/commissionDomain'
import type { CommercialLedgerRepository } from '@/services/commercial/commercialLedgerRepository'
import { LedgerService } from '@/services/commercial/LedgerService'
import { CommercialError } from '@/services/commercial/PaymentIntentService'
import {
  getPaymentProvider,
  type PaymentProvider,
} from '@/services/commercial/PaymentProvider'
import type { PaymentIntentRecord, PaymentTransactionRecord } from '@/types/commercialLedger'

export class RefundService {
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

  async refundableBalance(intent: PaymentIntentRecord): Promise<number> {
    if (intent.status !== 'SUCCEEDED' && intent.status !== 'PARTIALLY_REFUNDED') {
      return 0
    }
    const refunded = await this.repo.sumRefundsForIntent(intent.id)
    return intent.amountMinor - refunded
  }

  /**
   * Full or partial refund with ledger reversals.
   * Over-refund rejected. Original ledger rows never mutated.
   */
  async createRefund(input: {
    paymentIntentId: string
    amountMinor: number
    actorUserId: string
    useTestProvider?: boolean
  }): Promise<{
    intent: PaymentIntentRecord
    txn: PaymentTransactionRecord
    ledgerTransactionId: string
  }> {
    this.assertLedger()
    const amountMinor = assertIntegerMinor(input.amountMinor)
    if (amountMinor <= 0) {
      throw new CommercialError('INVALID_REFUND_AMOUNT', 'INVALID_REFUND_AMOUNT')
    }

    const intent = await this.repo.findIntentById(input.paymentIntentId)
    if (!intent) throw new CommercialError('NOT_FOUND', 'NOT_FOUND')
    if (intent.status !== 'SUCCEEDED' && intent.status !== 'PARTIALLY_REFUNDED') {
      throw new CommercialError('INTENT_NOT_REFUNDABLE', 'INVALID_STATE')
    }

    const refundable = await this.refundableBalance(intent)
    if (amountMinor > refundable) {
      throw new CommercialError('OVER_REFUND', 'OVER_REFUND')
    }

    const booking = await this.repo.findBooking(intent.bookingId)
    if (!booking) throw new CommercialError('BOOKING_NOT_FOUND', 'NOT_FOUND')

    const gross = booking.grossAmountMinor ?? intent.amountMinor
    const commission = booking.platformCommissionMinor ?? 0
    const publisherNet = booking.publisherNetMinor ?? gross - commission
    const split = proportionalRefundSplit(amountMinor, gross, commission, publisherNet)

    const idempotencyKey = `refund:${intent.id}:${amountMinor}:${refundable}`

    if (input.useTestProvider && intent.provider === 'TEST') {
      const provider = this.providerFactory('TEST')
      await provider.refundPayment({
        providerReference: intent.providerReference ?? intent.id,
        amountMinor,
        currency: intent.currency,
        idempotencyKey,
      })
    }

    const { txn, created } = await this.repo.createPaymentTransaction({
      paymentIntentId: intent.id,
      provider: intent.provider,
      providerTransactionId: `refund_${idempotencyKey}`,
      transactionType: 'REFUND',
      status: 'SUCCEEDED',
      amountMinor,
      currency: intent.currency,
      idempotencyKey,
    })

    if (!created) {
      // Idempotent replay
      const entries = await this.repo.listLedgerForBooking(intent.bookingId)
      const ledgerTransactionId =
        entries.filter((e) => e.entryType === 'REFUND').at(-1)?.transactionId ?? ''
      return {
        intent: (await this.repo.findIntentById(intent.id))!,
        txn,
        ledgerTransactionId,
      }
    }

    await this.repo.writeAudit({
      eventType: 'REFUND_CREATED',
      actorUserId: input.actorUserId,
      advertiserId: intent.advertiserId,
      publisherId: intent.publisherId,
      bookingId: intent.bookingId,
      entityType: 'payment_transaction',
      entityId: txn.id,
      payload: { amountMinor },
    })

    const lines = this.ledger.buildRefundReversalLines({
      refundMinor: amountMinor,
      publisherRefundMinor: split.publisherRefundMinor,
      commissionRefundMinor: split.commissionRefundMinor,
      publisherId: intent.publisherId,
    })

    const { transactionId } = await this.ledger.postBalancedEntries({
      bookingId: intent.bookingId,
      paymentIntentId: intent.id,
      currency: intent.currency,
      lines,
    })

    const remaining = refundable - amountMinor
    const newStatus = remaining === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
    await this.repo.updateIntentStatus(
      intent.id,
      ['SUCCEEDED', 'PARTIALLY_REFUNDED'],
      newStatus
    )

    if (remaining === 0) {
      await this.repo.transitionBookingStatus(
        intent.bookingId,
        ['PAID_PENDING_DELIVERY', 'READY', 'COMPLETED', 'PAYMENT_PROCESSING'],
        'REFUNDED'
      )
      const earning = await this.repo.findActiveEarningForBooking(intent.bookingId)
      if (earning && earning.status === 'PENDING') {
        await this.repo.updateEarning(earning.id, {
          status: 'REVERSED',
          commissionStatus: 'REVERSED_COMMISSION',
          netMinor: 0,
        })
      }
    } else {
      const earning = await this.repo.findActiveEarningForBooking(intent.bookingId)
      if (earning && earning.status === 'PENDING') {
        const newNet = Math.max(0, earning.netMinor - split.publisherRefundMinor)
        await this.repo.updateEarning(earning.id, { netMinor: newNet })
      }
    }

    await this.repo.writeAudit({
      eventType: 'REFUND_POSTED',
      actorUserId: input.actorUserId,
      advertiserId: intent.advertiserId,
      publisherId: intent.publisherId,
      bookingId: intent.bookingId,
      entityType: 'ledger_transaction',
      entityId: transactionId,
      payload: { amountMinor, remaining },
    })

    return {
      intent: (await this.repo.findIntentById(intent.id))!,
      txn,
      ledgerTransactionId: transactionId,
    }
  }
}
