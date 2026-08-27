import {
  buildCommercialSnapshot,
  computeCommissionMinor,
} from '@/lib/commercial/commissionDomain'
import { getDefaultPlatformCommissionBps } from '@/lib/commercial/commissionConfig'
import type { CommercialSnapshot, PlatformCommissionTotals } from '@/types/commercialLedger'
import type { LedgerEntryRecord } from '@/types/commercialLedger'
import { accountNet } from '@/services/commercial/LedgerService'

export class CommissionService {
  compute(grossMinor: number, bps?: number): CommercialSnapshot {
    return buildCommercialSnapshot(
      grossMinor,
      'TRY',
      bps ?? getDefaultPlatformCommissionBps(),
      null
    )
  }

  commissionMinor(grossMinor: number, bps?: number): number {
    return computeCommissionMinor(grossMinor, bps ?? getDefaultPlatformCommissionBps())
  }

  /** Internal/admin — pending vs earned commission from ledger. */
  summarizeFromLedger(entries: LedgerEntryRecord[], currency = 'TRY'): PlatformCommissionTotals {
    const pending = Math.max(0, accountNet(entries, 'PLATFORM_PENDING_COMMISSION'))
    const earned = Math.max(0, accountNet(entries, 'PLATFORM_COMMISSION_REVENUE'))
    return {
      pendingCommission: pending,
      earnedCommission: earned,
      currency,
    }
  }
}

export const commissionService = new CommissionService()
