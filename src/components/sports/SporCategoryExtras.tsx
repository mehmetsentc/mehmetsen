'use client'

import { MatchResults } from '@/components/sports/MatchResults'
import { SuperLigTable } from '@/components/sports/SuperLigTable'
import { TransferStrip } from '@/components/sports/TransferStrip'
import { WorldCupStrip } from '@/components/sports/WorldCupStrip'

export function SporCategoryExtras() {
  return (
    <div className="space-y-6">
      <WorldCupStrip />
      <MatchResults />
      <SuperLigTable />
      <TransferStrip />
    </div>
  )
}
