'use client'

import { MackolikScoreboard } from '@/components/sports/MackolikScoreboard'
import { TransferStrip } from '@/components/sports/TransferStrip'

/**
 * /kategori/spor üst slot — Maçkolik tarzı canlı skor + transfer şeridi.
 * Alt kategori haber bölümleri CategoryThemedFeed’de ayrı kalır.
 */
export function SporCategoryExtras() {
  return (
    <div className="space-y-6">
      <MackolikScoreboard />
      <TransferStrip />
    </div>
  )
}
