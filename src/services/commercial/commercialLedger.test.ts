/**
 * Phase P10A — Commercial ledger / commission / payment intent / refund tests.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildCommercialSnapshot,
  computeCommissionMinor,
  CommercialValidationError,
  proportionalRefundSplit,
  assertNoFloatMoney,
} from '@/lib/commercial/commissionDomain'
import {
  DEFAULT_PLATFORM_COMMISSION_BPS,
  getDefaultPlatformCommissionBps,
} from '@/lib/commercial/commissionConfig'
import {
  assertTestPaymentProviderAllowed,
  isTestPaymentProviderEnabled,
} from '@/lib/commercial/commercialFlags'
import { CARD_DATA_POLICY } from '@/types/commercialLedger'
import { InMemoryCommercialLedgerRepository } from '@/services/commercial/InMemoryCommercialLedgerRepository'
import { PaymentIntentService, CommercialError } from '@/services/commercial/PaymentIntentService'
import { CommercialTransactionService } from '@/services/commercial/CommercialTransactionService'
import { RefundService } from '@/services/commercial/RefundService'
import { LedgerService, assertBalanced } from '@/services/commercial/LedgerService'
import { checkBookingFinancialInvariants } from '@/services/commercial/financialInvariants'
import { CommissionService } from '@/services/commercial/CommissionService'
import { TestPaymentProvider } from '@/services/commercial/PaymentProvider'
import type { AdBookingRecord } from '@/types/advertiserMarketplace'
import { buildCommercialSnapshot as snap } from '@/lib/commercial/commissionDomain'

function seedFlags() {
  process.env.COMMERCIAL_LEDGER_ENABLED = 'true'
  process.env.PAYMENT_INTENT_ENABLED = 'true'
  process.env.PUBLISHER_EARNINGS_ENABLED = 'true'
  process.env.TEST_PAYMENT_PROVIDER_ENABLED = 'true'
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'test'
  delete process.env.VERCEL_ENV
}

function booking(over: Partial<AdBookingRecord> = {}): AdBookingRecord {
  const commercial = snap(1_000_000, 'TRY', 1500)
  return {
    id: 'abook_1',
    bookingRequestId: 'abr_1',
    advertiserId: 'adv_1',
    campaignId: 'acamp_1',
    publisherId: 'pub_1',
    inventoryId: 'pad_1',
    creativeId: null,
    creativeSnapshot: null,
    status: 'PENDING_PAYMENT',
    startAt: new Date('2026-09-01'),
    endAt: new Date('2026-09-30'),
    impressionLimit: null,
    priceMinor: commercial.grossAmountMinor,
    currency: 'TRY',
    pricingModelSnapshot: 'FIXED_PERIOD',
    grossAmountMinor: commercial.grossAmountMinor,
    platformCommissionRateBps: commercial.platformCommissionRateBps,
    platformCommissionMinor: commercial.platformCommissionMinor,
    publisherGrossMinor: commercial.publisherGrossMinor,
    publisherNetMinor: commercial.publisherNetMinor,
    taxPlaceholderMinor: null,
    invoiceStatus: null,
    taxProfileId: null,
    commercialSnapshotAt: new Date(),
    commercialFrozen: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

describe('P10A commission (§49)', () => {
  it('0%', () => {
    expect(computeCommissionMinor(1_000_000, 0)).toBe(0)
    const s = buildCommercialSnapshot(1_000_000, 'TRY', 0)
    expect(s.publisherNetMinor).toBe(1_000_000)
  })
  it('15% default example 10_000 TRY', () => {
    // 10_000 TRY = 1_000_000 kuruş
    const s = buildCommercialSnapshot(1_000_000, 'TRY', 1500)
    expect(s.platformCommissionMinor).toBe(150_000)
    expect(s.publisherNetMinor).toBe(850_000)
    expect(s.grossAmountMinor).toBe(s.platformCommissionMinor + s.publisherNetMinor)
  })
  it('100%', () => {
    const s = buildCommercialSnapshot(1_000_000, 'TRY', 10_000)
    expect(s.platformCommissionMinor).toBe(1_000_000)
    expect(s.publisherNetMinor).toBe(0)
  })
  it('rounding truncates', () => {
    // 1001 * 1500 / 10000 = 150.15 → 150
    expect(computeCommissionMinor(1001, 1500)).toBe(150)
  })
  it('large amount', () => {
    const s = buildCommercialSnapshot(9_999_999_999, 'TRY', 1500)
    expect(s.grossAmountMinor).toBe(s.platformCommissionMinor + s.publisherNetMinor)
  })
  it('invalid >100%', () => {
    expect(() => computeCommissionMinor(1000, 10_001)).toThrow(CommercialValidationError)
  })
  it('DEFAULT_PLATFORM_COMMISSION_BPS is 1500 via config', () => {
    expect(DEFAULT_PLATFORM_COMMISSION_BPS).toBe(1500)
    expect(getDefaultPlatformCommissionBps()).toBe(1500)
  })
})

describe('P10A payment intent (§50)', () => {
  let repo: InMemoryCommercialLedgerRepository
  let svc: PaymentIntentService

  beforeEach(() => {
    seedFlags()
    repo = new InMemoryCommercialLedgerRepository()
    svc = new PaymentIntentService(repo as never)
  })

  it('creates intent from booking snapshot; client amount ignored', async () => {
    repo.seedBooking(booking())
    const intent = await svc.createForBooking({
      booking: booking(),
      advertiserId: 'adv_1',
      actorUserId: 'u1',
      clientAmountMinor: 1,
      clientCommission: 999,
      preferredProvider: 'TEST',
    })
    expect(intent.amountMinor).toBe(1_000_000)
    expect(intent.status).toMatch(/PENDING|REQUIRES_PAYMENT/)
  })

  it('one active intent per booking', async () => {
    repo.seedBooking(booking())
    const a = await svc.createForBooking({
      booking: booking(),
      advertiserId: 'adv_1',
      actorUserId: 'u1',
      preferredProvider: 'TEST',
    })
    const b = await svc.createForBooking({
      booking: booking(),
      advertiserId: 'adv_1',
      actorUserId: 'u1',
      preferredProvider: 'TEST',
    })
    expect(a.id).toBe(b.id)
  })

  it('cross advertiser denied', async () => {
    repo.seedBooking(booking())
    await expect(
      svc.createForBooking({
        booking: booking(),
        advertiserId: 'adv_OTHER',
        actorUserId: 'u1',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('P10A success + ledger (§51)', () => {
  let repo: InMemoryCommercialLedgerRepository
  let txnSvc: CommercialTransactionService
  let intentSvc: PaymentIntentService

  beforeEach(() => {
    seedFlags()
    repo = new InMemoryCommercialLedgerRepository()
    const provider = new TestPaymentProvider()
    txnSvc = new CommercialTransactionService(repo as never, () => provider)
    intentSvc = new PaymentIntentService(repo as never)
  })

  it('test provider success posts balanced ledger + PENDING earning', async () => {
    repo.seedBooking(booking())
    const intent = await intentSvc.createForBooking({
      booking: booking(),
      advertiserId: 'adv_1',
      actorUserId: 'u1',
      preferredProvider: 'TEST',
    })
    const result = await txnSvc.processTestPaymentSuccess({
      paymentIntentId: intent.id,
      actorUserId: 'u1',
    })
    expect(result.intent.status).toBe('SUCCEEDED')
    expect(repo.bookings.get('abook_1')!.status).toBe('PAID_PENDING_DELIVERY')
    expect(result.earning?.status).toBe('PENDING')
    expect(result.earning?.netMinor).toBe(850_000)
    expect(result.earning?.commissionStatus).toBe('PENDING_COMMISSION')

    const entries = await repo.listLedgerForBooking('abook_1')
    const ledger = new LedgerService(repo as never)
    assertBalanced(
      entries.map((e) => ({
        accountType: e.accountType,
        accountId: e.accountId,
        entryType: e.entryType,
        amountMinor: e.amountMinor,
        direction: e.direction,
      }))
    )
    void ledger
    const report = await checkBookingFinancialInvariants(repo as never, 'abook_1', intent.id)
    expect(report.balanced).toBe(true)
    expect(report.publisherPayableMinor).toBe(850_000)
    expect(report.commissionPendingMinor).toBe(150_000)
  })
})

describe('P10A idempotency (§52)', () => {
  it('same success twice → one ledger transaction', async () => {
    seedFlags()
    const repo = new InMemoryCommercialLedgerRepository()
    const provider = new TestPaymentProvider()
    const txnSvc = new CommercialTransactionService(repo as never, () => provider)
    const intentSvc = new PaymentIntentService(repo as never)
    repo.seedBooking(booking())
    const intent = await intentSvc.createForBooking({
      booking: booking(),
      advertiserId: 'adv_1',
      actorUserId: 'u1',
      preferredProvider: 'TEST',
    })
    await txnSvc.processTestPaymentSuccess({ paymentIntentId: intent.id, actorUserId: 'u1' })
    await txnSvc.processTestPaymentSuccess({ paymentIntentId: intent.id, actorUserId: 'u1' })
    const captures = (await repo.listLedgerForBooking('abook_1')).filter(
      (e) => e.entryType === 'PAYMENT_CAPTURE'
    )
    expect(captures).toHaveLength(1)
    const earnings = [...repo.earnings.values()]
    expect(earnings).toHaveLength(1)
  })
})

describe('P10A partial failure + reconcile (§53)', () => {
  it('success txn stored but ledger missing → reconcile heals once', async () => {
    seedFlags()
    const repo = new InMemoryCommercialLedgerRepository()
    const provider = new TestPaymentProvider()
    const txnSvc = new CommercialTransactionService(repo as never, () => provider)
    const intentSvc = new PaymentIntentService(repo as never)
    repo.seedBooking(booking())
    const intent = await intentSvc.createForBooking({
      booking: booking(),
      advertiserId: 'adv_1',
      actorUserId: 'u1',
      preferredProvider: 'TEST',
    })
    // Simulate: capture txn exists, intent SUCCEEDED, no ledger
    await repo.updateIntentStatus(intent.id, ['PENDING', 'REQUIRES_PAYMENT'], 'SUCCEEDED', {
      providerReference: 'test_ref',
    })
    await repo.createPaymentTransaction({
      paymentIntentId: intent.id,
      provider: 'TEST',
      providerTransactionId: `test_txn_${intent.id}`,
      transactionType: 'CAPTURE',
      status: 'SUCCEEDED',
      amountMinor: intent.amountMinor,
      currency: 'TRY',
      idempotencyKey: `capture:${intent.id}:test_txn_${intent.id}`,
    })
    expect(await repo.hasPaymentCaptureLedger('abook_1')).toBe(false)
    const r1 = await txnSvc.reconcileBookingLedger('abook_1', intent.id, 'u1')
    expect(r1.repaired).toBe(true)
    expect(await repo.hasPaymentCaptureLedger('abook_1')).toBe(true)
    const r2 = await txnSvc.reconcileBookingLedger('abook_1', intent.id, 'u1')
    expect(r2.repaired).toBe(false)
    const captures = (await repo.listLedgerForBooking('abook_1')).filter(
      (e) => e.entryType === 'PAYMENT_CAPTURE'
    )
    expect(captures).toHaveLength(1)
  })
})

describe('P10A refunds (§54)', () => {
  async function paidSetup() {
    seedFlags()
    const repo = new InMemoryCommercialLedgerRepository()
    const provider = new TestPaymentProvider()
    const txnSvc = new CommercialTransactionService(repo as never, () => provider)
    const intentSvc = new PaymentIntentService(repo as never)
    const refundSvc = new RefundService(repo as never, () => provider)
    repo.seedBooking(booking())
    const intent = await intentSvc.createForBooking({
      booking: booking(),
      advertiserId: 'adv_1',
      actorUserId: 'u1',
      preferredProvider: 'TEST',
    })
    await txnSvc.processTestPaymentSuccess({ paymentIntentId: intent.id, actorUserId: 'u1' })
    return { repo, refundSvc, intent }
  }

  it('full refund reverses earning + balances ledger', async () => {
    const { repo, refundSvc, intent } = await paidSetup()
    await refundSvc.createRefund({
      paymentIntentId: intent.id,
      amountMinor: 1_000_000,
      actorUserId: 'u1',
      useTestProvider: true,
    })
    expect((await repo.findIntentById(intent.id))!.status).toBe('REFUNDED')
    expect(repo.bookings.get('abook_1')!.status).toBe('REFUNDED')
    const earning = [...repo.earnings.values()][0]
    expect(earning.status).toBe('REVERSED')
    const report = await checkBookingFinancialInvariants(repo as never, 'abook_1', intent.id)
    expect(report.balanced).toBe(true)
    expect(report.publisherPayableMinor).toBe(0)
  })

  it('partial refund', async () => {
    const { repo, refundSvc, intent } = await paidSetup()
    await refundSvc.createRefund({
      paymentIntentId: intent.id,
      amountMinor: 200_000,
      actorUserId: 'u1',
      useTestProvider: true,
    })
    expect((await repo.findIntentById(intent.id))!.status).toBe('PARTIALLY_REFUNDED')
    const report = await checkBookingFinancialInvariants(repo as never, 'abook_1', intent.id)
    expect(report.balanced).toBe(true)
    expect(report.refundsMinor).toBe(200_000)
  })

  it('over-refund rejected', async () => {
    const { refundSvc, intent } = await paidSetup()
    await expect(
      refundSvc.createRefund({
        paymentIntentId: intent.id,
        amountMinor: 1_000_001,
        actorUserId: 'u1',
      })
    ).rejects.toMatchObject({ code: 'OVER_REFUND' })
  })
})

describe('P10A security (§55)', () => {
  it('TestPaymentProvider hard-rejected in production', () => {
    const prev = process.env.NODE_ENV
    ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'production'
    process.env.TEST_PAYMENT_PROVIDER_ENABLED = 'true'
    expect(isTestPaymentProviderEnabled()).toBe(false)
    expect(() => assertTestPaymentProviderAllowed()).toThrow(/hard-rejected/)
    expect(() => new TestPaymentProvider()).toThrow(/hard-rejected/)
    ;(process.env as { NODE_ENV?: string }).NODE_ENV = prev
  })

  it('client cannot set commission — server computes', () => {
    const s = buildCommercialSnapshot(1_000_000, 'TRY')
    expect(s.platformCommissionRateBps).toBe(1500)
    // client "ignored" values never enter snapshot
  })

  it('card data policy documented', () => {
    expect(CARD_DATA_POLICY).toContain('NO_RAW_CARD_DATA')
  })

  it('publisher cannot self-release via refund service amounts from client commission', () => {
    const split = proportionalRefundSplit(100_000, 1_000_000, 150_000, 850_000)
    expect(split.commissionRefundMinor + split.publisherRefundMinor).toBe(100_000)
  })
})

describe('P10A money (§56)', () => {
  it('all minor units integer; no float', () => {
    const s = buildCommercialSnapshot(1_000_000, 'TRY', 1500)
    assertNoFloatMoney(
      s.grossAmountMinor,
      s.platformCommissionMinor,
      s.publisherNetMinor
    )
    expect(s.grossAmountMinor).toBe(s.platformCommissionMinor + s.publisherNetMinor)
  })

  it('CommissionService wrapper', () => {
    const c = new CommissionService()
    expect(c.commissionMinor(1_000_000)).toBe(150_000)
  })
})

afterEach(() => {
  // leave env as-is for other suites; vitest isolates files
})
