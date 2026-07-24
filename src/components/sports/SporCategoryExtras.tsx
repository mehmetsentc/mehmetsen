'use client'

import { SuperLigTable } from '@/components/sports/SuperLigTable'
import { TransferStrip } from '@/components/sports/TransferStrip'

/**
 * Spor üst sayfası — genel skorlar artık Futbol/Basketbol/Voleybol bölümlerinin
 * altında (CategoryThemedFeed). Burada yalnızca futbol bağlamı (puan / transfer).
 */
export function SporCategoryExtras() {
  return (
    <div className="space-y-6">
      <SuperLigTable />
      <TransferStrip />
    </div>
  )
}
