/**
 * Financial invariant checker — admin/dev utility only.
 * NO public HTTP endpoint.
 */
import type { CommercialLedgerRepository } from '@/services/commercial/commercialLedgerRepository'
import { accountNet, sumDirection } from '@/services/commercial/LedgerService'
import type { FinancialInvariantReport } from '@/types/commercialLedger'

export async function checkBookingFinancialInvariants(
  repo: CommercialLedgerRepository,
  bookingId: string,
  paymentIntentId?: string | null
): Promise<FinancialInvariantReport> {
  const entries = await thisOrRepoList(repo, bookingId)
  const debit = sumDirection(entries, 'DEBIT')
  const credit = sumDirection(entries, 'CREDIT')
  const publisherPayable = Math.max(0, accountNet(entries, 'PUBLISHER_PAYABLE'))
  const commissionPending = Math.max(0, accountNet(entries, 'PLATFORM_PENDING_COMMISSION'))

  let paidAmountMinor = 0
  let refundsMinor = 0
  if (paymentIntentId) {
    const intent = await repo.findIntentById(paymentIntentId)
    if (intent) {
      const txns = await repo.listTxnsForIntent(intent.id)
      paidAmountMinor = txns
        .filter((t) => t.transactionType === 'CAPTURE' && t.status === 'SUCCEEDED')
        .reduce((s, t) => s + t.amountMinor, 0)
      refundsMinor = txns
        .filter((t) => t.transactionType === 'REFUND' && t.status === 'SUCCEEDED')
        .reduce((s, t) => s + t.amountMinor, 0)
    }
  } else {
    paidAmountMinor = entries
      .filter((e) => e.entryType === 'PAYMENT_CAPTURE' && e.direction === 'DEBIT')
      .reduce((s, e) => s + e.amountMinor, 0)
    refundsMinor = entries
      .filter((e) => e.entryType === 'REFUND' && e.direction === 'CREDIT')
      .reduce((s, e) => s + e.amountMinor, 0)
  }

  const issues: string[] = []
  if (debit !== credit) issues.push(`UNBALANCED debit=${debit} credit=${credit}`)
  if (paidAmountMinor - refundsMinor !== publisherPayable + commissionPending) {
    // After full refund both sides zero — OK
    const netPaid = paidAmountMinor - refundsMinor
    const netLiability = publisherPayable + commissionPending
    if (netPaid !== netLiability) {
      issues.push(`NET_MISMATCH paid-refunds=${netPaid} payable+commission=${netLiability}`)
    }
  }

  return {
    bookingId,
    paidAmountMinor,
    ledgerDebitMinor: debit,
    ledgerCreditMinor: credit,
    publisherPayableMinor: publisherPayable,
    commissionPendingMinor: commissionPending,
    refundsMinor,
    balanced: issues.length === 0,
    issues,
  }
}

async function thisOrRepoList(repo: CommercialLedgerRepository, bookingId: string) {
  return repo.listLedgerForBooking(bookingId)
}

/** Spec alias. */
export async function reconcileBookingLedger(
  commercialTxn: {
    reconcileBookingLedger: (
      bookingId: string,
      intentId: string | null,
      actorUserId: string
    ) => Promise<{ repaired: boolean; ledgerTransactionId: string | null }>
  },
  bookingId: string,
  intentId: string | null,
  actorUserId = 'system'
) {
  return commercialTxn.reconcileBookingLedger(bookingId, intentId, actorUserId)
}
