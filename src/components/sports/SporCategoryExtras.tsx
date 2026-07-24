'use client'

import { MatchResults } from '@/components/sports/MatchResults'
import { SuperLigTable } from '@/components/sports/SuperLigTable'
import { TransferStrip } from '@/components/sports/TransferStrip'

/** Spor kategori sayfası ekstra widget'ları — post-WC: futbol skorları önde. */
export function SporCategoryExtras() {
  return (
    <div className="space-y-6">
      <MatchResults />
      <SuperLigTable />
      <TransferStrip />
    </div>
  )
}
