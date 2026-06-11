import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CategoryFeed } from '@/components/feed/CategoryFeed'
import { WorldCupStrip } from '@/components/sports/WorldCupStrip'
import { MatchResults } from '@/components/sports/MatchResults'
import { SuperLigTable } from '@/components/sports/SuperLigTable'
import { TransferStrip } from '@/components/sports/TransferStrip'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'

export const metadata: Metadata = {
  title: 'Spor Haberleri | NaHaber',
  description: 'NaHaber\'de son dakika spor haberleri, maç sonuçları ve Dünya Kupası gelişmeleri',
  openGraph: {
    title: 'Spor Haberleri | NaHaber',
    description: 'Son dakika spor haberleri, maç sonuçları ve Dünya Kupası gelişmeleri',
  },
}

export default function SporPage() {
  return (
    <div className="w-full">
      {/* Category header */}
      <div
        className="mb-5 flex items-center gap-3 rounded-2xl px-4 py-3"
        style={{ backgroundColor: '#10B98118', borderLeft: '4px solid #10B981' }}
      >
        <div>
          <h1 className="text-xl font-black tracking-tight text-[rgb(var(--color-text))]">
            ⚽ Spor
          </h1>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Son dakika spor haberleri ve maç sonuçları
          </p>
        </div>
      </div>

      {/* 🏆 Dünya Kupası yatay kaydırma şeridi */}
      <WorldCupStrip />

      {/* ⚽ Maç Sonuçları */}
      <MatchResults />

      {/* 🇹🇷 Süper Lig Puan Tablosu — Transfermarkt */}
      <SuperLigTable />

      {/* 💸 Son Transferler — Transfermarkt */}
      <TransferStrip />

      {/* Divider */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--color-muted))]">
          Tüm Haberler
        </span>
        <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
      </div>

      {/* Regular sports news feed */}
      <Suspense
        fallback={
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <TimelineItemSkeleton key={i} />
            ))}
          </div>
        }
      >
        <CategoryFeed categoryId="spor" />
      </Suspense>
    </div>
  )
}
