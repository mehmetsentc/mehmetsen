'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ArrowRight, Loader2 } from 'lucide-react'
import type { TmTransfer } from '@/lib/sports/transfermarkt'

function TransferCard({ t }: { t: TmTransfer }) {
  return (
    <div className="flex min-w-[200px] flex-col gap-2 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
      {/* Oyuncu */}
      <div className="flex items-center gap-2">
        {t.playerImage ? (
          <Image src={t.playerImage} alt={t.playerName} width={32} height={32}
            className="rounded-full object-cover" unoptimized />
        ) : (
          <div className="h-8 w-8 rounded-full bg-[rgb(var(--color-surface))]" />
        )}
        <span className="truncate text-[12px] font-bold text-[rgb(var(--color-text))]">
          {t.playerName}
        </span>
      </div>

      {/* Kulüpler */}
      <div className="flex items-center gap-1.5 text-[11px] text-[rgb(var(--color-muted))]">
        <span className="truncate">{t.fromClub}</span>
        <ArrowRight className="h-3 w-3 shrink-0 text-emerald-500" />
        <span className="truncate font-semibold text-[rgb(var(--color-text))]">{t.toClub}</span>
      </div>

      {/* Ücret + Tarih */}
      <div className="flex items-center justify-between">
        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
          t.fee ? 'bg-emerald-500/15 text-emerald-500' : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]'
        }`}>
          {t.feeLabel}
        </span>
        <span className="text-[10px] text-[rgb(var(--color-muted))]">{t.date}</span>
      </div>
    </div>
  )
}

export function TransferStrip() {
  const [transfers, setTransfers] = useState<TmTransfer[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    fetch('/api/sports/transfermarkt?type=transfers')
      .then(r => r.json())
      .then((d: { data: TmTransfer[] }) => setTransfers(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && transfers.length === 0) return null

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-sm font-bold text-[rgb(var(--color-text))]">
        💸 Son Transferler
      </h2>

      {loading ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
          {transfers.map(t => <TransferCard key={t.id} t={t} />)}
        </div>
      )}
    </section>
  )
}
