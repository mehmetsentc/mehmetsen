/**
 * P10A local/staging financial smoke — TEST provider only.
 * Creates synthetic 10_000 TRY booking flow in-memory (no production money).
 * Usage: npx tsx scripts/_phase_p10a-smoke.mts
 */
import { buildCommercialSnapshot } from '../src/lib/commercial/commissionDomain'
import { InMemoryCommercialLedgerRepository } from '../src/services/commercial/InMemoryCommercialLedgerRepository'
import { PaymentIntentService } from '../src/services/commercial/PaymentIntentService'
import { CommercialTransactionService } from '../src/services/commercial/CommercialTransactionService'
import { RefundService } from '../src/services/commercial/RefundService'
import { TestPaymentProvider } from '../src/services/commercial/PaymentProvider'
import { checkBookingFinancialInvariants } from '../src/services/commercial/financialInvariants'
import type { AdBookingRecord } from '../src/types/advertiserMarketplace'

;(process.env as { NODE_ENV?: string }).NODE_ENV = 'test'
process.env.COMMERCIAL_LEDGER_ENABLED = 'true'
process.env.PAYMENT_INTENT_ENABLED = 'true'
process.env.PUBLISHER_EARNINGS_ENABLED = 'true'
process.env.TEST_PAYMENT_PROVIDER_ENABLED = 'true'
delete process.env.VERCEL_ENV

async function main() {
  const snap = buildCommercialSnapshot(1_000_000, 'TRY', 1500)
  console.log('SNAPSHOT', {
    gross: snap.grossAmountMinor,
    commission: snap.platformCommissionMinor,
    publisherNet: snap.publisherNetMinor,
  })

  const repo = new InMemoryCommercialLedgerRepository()
  const provider = new TestPaymentProvider()
  const intentSvc = new PaymentIntentService(repo as never)
  const txnSvc = new CommercialTransactionService(repo as never, () => provider)
  const refundSvc = new RefundService(repo as never, () => provider)

  const booking: AdBookingRecord = {
    id: 'abook_smoke',
    bookingRequestId: 'abr_smoke',
    advertiserId: 'adv_smoke',
    campaignId: 'acamp_smoke',
    publisherId: 'pub_smoke',
    inventoryId: 'pad_smoke',
    creativeId: null,
    creativeSnapshot: null,
    status: 'PENDING_PAYMENT',
    startAt: new Date(),
    endAt: new Date(Date.now() + 86400000),
    impressionLimit: null,
    priceMinor: snap.grossAmountMinor,
    currency: 'TRY',
    pricingModelSnapshot: 'FIXED_PERIOD',
    grossAmountMinor: snap.grossAmountMinor,
    platformCommissionRateBps: snap.platformCommissionRateBps,
    platformCommissionMinor: snap.platformCommissionMinor,
    publisherGrossMinor: snap.publisherGrossMinor,
    publisherNetMinor: snap.publisherNetMinor,
    taxPlaceholderMinor: null,
    invoiceStatus: null,
    taxProfileId: null,
    commercialSnapshotAt: new Date(),
    commercialFrozen: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  repo.seedBooking(booking)

  const intent = await intentSvc.createForBooking({
    booking,
    advertiserId: 'adv_smoke',
    actorUserId: 'smoke',
    preferredProvider: 'TEST',
  })
  const paid = await txnSvc.processTestPaymentSuccess({
    paymentIntentId: intent.id,
    actorUserId: 'smoke',
  })

  console.log('PAID', {
    intentStatus: paid.intent.status,
    bookingStatus: repo.bookings.get('abook_smoke')!.status,
    publisherPending: paid.earning?.netMinor,
    commissionPending: snap.platformCommissionMinor,
  })

  const beforeRefund = await checkBookingFinancialInvariants(repo as never, 'abook_smoke', intent.id)
  console.log('INVARIANT_AFTER_PAY', beforeRefund)

  await refundSvc.createRefund({
    paymentIntentId: intent.id,
    amountMinor: 1_000_000,
    actorUserId: 'smoke',
    useTestProvider: true,
  })

  const afterRefund = await checkBookingFinancialInvariants(repo as never, 'abook_smoke', intent.id)
  console.log('INVARIANT_AFTER_REFUND', afterRefund)
  console.log('BOOKING_FINAL', repo.bookings.get('abook_smoke')!.status)
  console.log('EARNING_FINAL', [...repo.earnings.values()][0]?.status)

  if (
    paid.earning?.netMinor !== 850_000 ||
    snap.platformCommissionMinor !== 150_000 ||
    !beforeRefund.balanced ||
    !afterRefund.balanced ||
    afterRefund.publisherPayableMinor !== 0
  ) {
    console.error('SMOKE_FAILED')
    process.exit(1)
  }
  console.log('SMOKE_OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
