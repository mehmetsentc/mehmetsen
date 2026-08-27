import { assertIntegerMinor, assertNoFloatMoney } from '@/lib/commercial/commissionDomain'
import { newCommercialId } from '@/lib/commercial/id'
import type { CommercialLedgerRepository } from '@/services/commercial/commercialLedgerRepository'
import type {
  LedgerAccountType,
  LedgerDirection,
  LedgerEntryRecord,
  LedgerEntryType,
} from '@/types/commercialLedger'

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly code: string = 'LEDGER_ERROR'
  ) {
    super(message)
    this.name = 'LedgerError'
  }
}

export interface LedgerLine {
  accountType: LedgerAccountType
  accountId: string | null
  entryType: LedgerEntryType
  amountMinor: number
  direction: LedgerDirection
  metadataJson?: Record<string, unknown> | null
}

/** Double-entry: sum(debit) must equal sum(credit). Entries are append-only. */
export function assertBalanced(lines: LedgerLine[]): void {
  let debit = 0
  let credit = 0
  for (const line of lines) {
    assertIntegerMinor(line.amountMinor)
    if (line.amountMinor < 0) throw new LedgerError('NEGATIVE_LEDGER_AMOUNT', 'NEGATIVE_LEDGER_AMOUNT')
    if (line.direction === 'DEBIT') debit += line.amountMinor
    else if (line.direction === 'CREDIT') credit += line.amountMinor
    else throw new LedgerError('INVALID_DIRECTION', 'INVALID_DIRECTION')
  }
  if (debit !== credit) {
    throw new LedgerError(`UNBALANCED_LEDGER debit=${debit} credit=${credit}`, 'UNBALANCED_LEDGER')
  }
}

export function sumDirection(entries: LedgerEntryRecord[], direction: LedgerDirection): number {
  return entries.filter((e) => e.direction === direction).reduce((s, e) => s + e.amountMinor, 0)
}

export function accountNet(
  entries: LedgerEntryRecord[],
  accountType: LedgerAccountType
): number {
  let n = 0
  for (const e of entries) {
    if (e.accountType !== accountType) continue
    n += e.direction === 'CREDIT' ? e.amountMinor : -e.amountMinor
  }
  return n
}

export class LedgerService {
  constructor(private readonly repo: CommercialLedgerRepository) {}

  /**
   * Post a balanced set of ledger lines under one transaction_id.
   * Never UPDATE/DELETE existing rows — corrections must use reversal lines.
   */
  async postBalancedEntries(input: {
    bookingId: string
    paymentIntentId: string | null
    currency: string
    lines: LedgerLine[]
    transactionId?: string
  }): Promise<{ transactionId: string; entries: LedgerEntryRecord[] }> {
    assertBalanced(input.lines)
    assertNoFloatMoney(...input.lines.map((l) => l.amountMinor))
    const transactionId = input.transactionId ?? newCommercialId('ctxn')
    const entries = await this.repo.insertLedgerEntries(
      input.lines.map((l) => ({
        transactionId,
        bookingId: input.bookingId,
        paymentIntentId: input.paymentIntentId,
        accountType: l.accountType,
        accountId: l.accountId,
        entryType: l.entryType,
        amountMinor: l.amountMinor,
        currency: input.currency,
        direction: l.direction,
        metadataJson: l.metadataJson ?? null,
      }))
    )
    return { transactionId, entries }
  }

  /** Payment success posting: cash clearing ← publisher payable + pending commission. */
  buildPaymentSuccessLines(input: {
    grossMinor: number
    publisherNetMinor: number
    commissionMinor: number
    publisherId: string
    advertiserId: string
  }): LedgerLine[] {
    assertNoFloatMoney(input.grossMinor, input.publisherNetMinor, input.commissionMinor)
    if (input.grossMinor !== input.publisherNetMinor + input.commissionMinor) {
      throw new LedgerError('GROSS_PARTS_MISMATCH', 'GROSS_PARTS_MISMATCH')
    }
    return [
      {
        accountType: 'PLATFORM_CASH_CLEARING',
        accountId: null,
        entryType: 'PAYMENT_CAPTURE',
        amountMinor: input.grossMinor,
        direction: 'DEBIT',
      },
      {
        accountType: 'PUBLISHER_PAYABLE',
        accountId: input.publisherId,
        entryType: 'PUBLISHER_EARNING_PENDING',
        amountMinor: input.publisherNetMinor,
        direction: 'CREDIT',
      },
      {
        accountType: 'PLATFORM_PENDING_COMMISSION',
        accountId: null,
        entryType: 'COMMISSION_PENDING',
        amountMinor: input.commissionMinor,
        direction: 'CREDIT',
      },
      // Mirror receivable clear (informational balanced pair already covered above).
      // Advertiser receivable was conceptual; cash clearing is the asset.
    ]
  }

  buildRefundReversalLines(input: {
    refundMinor: number
    publisherRefundMinor: number
    commissionRefundMinor: number
    publisherId: string
  }): LedgerLine[] {
    assertNoFloatMoney(
      input.refundMinor,
      input.publisherRefundMinor,
      input.commissionRefundMinor
    )
    if (input.refundMinor !== input.publisherRefundMinor + input.commissionRefundMinor) {
      throw new LedgerError('REFUND_PARTS_MISMATCH', 'REFUND_PARTS_MISMATCH')
    }
    return [
      {
        accountType: 'PUBLISHER_PAYABLE',
        accountId: input.publisherId,
        entryType: 'REVERSAL',
        amountMinor: input.publisherRefundMinor,
        direction: 'DEBIT',
      },
      {
        accountType: 'PLATFORM_PENDING_COMMISSION',
        accountId: null,
        entryType: 'REVERSAL',
        amountMinor: input.commissionRefundMinor,
        direction: 'DEBIT',
      },
      {
        accountType: 'PLATFORM_CASH_CLEARING',
        accountId: null,
        entryType: 'REFUND',
        amountMinor: input.refundMinor,
        direction: 'CREDIT',
      },
    ]
  }
}
