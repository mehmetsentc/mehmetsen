import { getDefaultPlatformCommissionBps } from '@/lib/commercial/commissionConfig'
import type { CommercialSnapshot } from '@/types/commercialLedger'

export class CommercialValidationError extends Error {
  constructor(
    message: string,
    readonly code: string = 'VALIDATION'
  ) {
    super(message)
    this.name = 'CommercialValidationError'
  }
}

/**
 * Commission = floor(gross * bps / 10000).
 * publisher_net = gross - commission.
 * Invariant: gross === commission + publisher_net.
 */
export function computeCommissionMinor(grossMinor: number, bps: number): number {
  if (!Number.isInteger(grossMinor) || grossMinor < 0) {
    throw new CommercialValidationError('INVALID_GROSS_MINOR', 'INVALID_GROSS_MINOR')
  }
  if (!Number.isInteger(bps) || bps < 0) {
    throw new CommercialValidationError('INVALID_COMMISSION_BPS', 'INVALID_COMMISSION_BPS')
  }
  if (bps > 10_000) {
    throw new CommercialValidationError('COMMISSION_BPS_EXCEEDS_100', 'COMMISSION_BPS_EXCEEDS_100')
  }
  // Integer arithmetic only — truncate toward zero (non-negative → floor).
  return Math.trunc((grossMinor * bps) / 10_000)
}

export function buildCommercialSnapshot(
  grossAmountMinor: number,
  currency = 'TRY',
  commissionBps: number = getDefaultPlatformCommissionBps(),
  taxPlaceholderMinor: number | null = null
): CommercialSnapshot {
  if (!Number.isInteger(grossAmountMinor) || grossAmountMinor < 0) {
    throw new CommercialValidationError('INVALID_GROSS_MINOR', 'INVALID_GROSS_MINOR')
  }
  if (typeof currency !== 'string' || currency.trim().length !== 3) {
    throw new CommercialValidationError('INVALID_CURRENCY', 'INVALID_CURRENCY')
  }
  if (taxPlaceholderMinor != null) {
    if (!Number.isInteger(taxPlaceholderMinor) || taxPlaceholderMinor < 0) {
      throw new CommercialValidationError('INVALID_TAX_PLACEHOLDER', 'INVALID_TAX_PLACEHOLDER')
    }
  }
  const platformCommissionMinor = computeCommissionMinor(grossAmountMinor, commissionBps)
  const publisherNetMinor = grossAmountMinor - platformCommissionMinor
  if (publisherNetMinor < 0) {
    throw new CommercialValidationError('NEGATIVE_PUBLISHER_NET', 'NEGATIVE_PUBLISHER_NET')
  }
  const snap: CommercialSnapshot = {
    grossAmountMinor,
    currency: currency.trim().toUpperCase(),
    platformCommissionRateBps: commissionBps,
    platformCommissionMinor,
    publisherGrossMinor: grossAmountMinor,
    publisherNetMinor,
    taxPlaceholderMinor,
  }
  assertGrossEqualsParts(snap)
  return snap
}

export function assertGrossEqualsParts(snap: CommercialSnapshot): void {
  if (snap.grossAmountMinor !== snap.platformCommissionMinor + snap.publisherNetMinor) {
    throw new CommercialValidationError('GROSS_PARTS_MISMATCH', 'GROSS_PARTS_MISMATCH')
  }
}

/** Assert value is integer minor units (no float). */
export function assertIntegerMinor(value: unknown, code = 'NON_INTEGER_MINOR'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isFinite(value)) {
    throw new CommercialValidationError(code, code)
  }
  return value
}

export function assertNoFloatMoney(...values: number[]): void {
  for (const v of values) {
    if (!Number.isInteger(v)) {
      throw new CommercialValidationError('FLOAT_MONEY_FORBIDDEN', 'FLOAT_MONEY_FORBIDDEN')
    }
  }
}

/** Proportional split for partial refunds — integer floor on commission share. */
export function proportionalRefundSplit(
  refundMinor: number,
  grossMinor: number,
  commissionMinor: number,
  publisherNetMinor: number
): { commissionRefundMinor: number; publisherRefundMinor: number } {
  assertIntegerMinor(refundMinor)
  assertIntegerMinor(grossMinor)
  if (refundMinor < 0 || refundMinor > grossMinor) {
    throw new CommercialValidationError('INVALID_REFUND_AMOUNT', 'INVALID_REFUND_AMOUNT')
  }
  if (grossMinor === 0) {
    return { commissionRefundMinor: 0, publisherRefundMinor: 0 }
  }
  if (refundMinor === grossMinor) {
    return {
      commissionRefundMinor: commissionMinor,
      publisherRefundMinor: publisherNetMinor,
    }
  }
  const commissionRefundMinor = Math.trunc((refundMinor * commissionMinor) / grossMinor)
  const publisherRefundMinor = refundMinor - commissionRefundMinor
  return { commissionRefundMinor, publisherRefundMinor }
}
