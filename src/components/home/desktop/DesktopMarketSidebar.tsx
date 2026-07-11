'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import type { FinanceRates } from '@/app/api/finance/rates/route'
import { ROUTES } from '@/constants/routes'

function fmt(n: number, decimals = 4) {
  return n.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function MarketRateCard({
  label,
  value,
  change,
}: {
  label: string
  value: string
  change: number
}) {
  const up = change >= 0

  return (
    <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--color-muted))]">
          {label}
        </span>
        <span className={`text-[10px] font-bold ${up ? 'text-emerald-500' : 'text-red-500'}`}>
          {up ? '▲' : '▼'}
        </span>
      </div>
      <p className="mt-1.5 text-lg font-black tabular-nums leading-none text-[rgb(var(--color-text))]">
        {value}
      </p>
      <p
        className={`mt-1 text-xs font-semibold tabular-nums ${up ? 'text-emerald-500' : 'text-red-500'}`}
      >
        %{change >= 0 ? '+' : ''}
        {change.toFixed(2)}
      </p>
    </div>
  )
}

function MarketSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden>
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`h-[88px] animate-pulse rounded-xl bg-[rgb(var(--color-border))] ${i === 4 ? 'col-span-2' : ''}`}
        />
      ))}
    </div>
  )
}

export function DesktopMarketSidebar() {
  const [rates, setRates] = useState<FinanceRates | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRates = () => {
      fetch('/api/finance/rates')
        .then((r) => (r.ok ? r.json() : null))
        .then((d: FinanceRates | null) => {
          if (d) setRates(d)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }

    fetchRates()
    const interval = setInterval(fetchRates, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div aria-label="Canlı piyasalar">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden />
          <h3 className="text-sm font-bold text-[rgb(var(--color-text))]">Canlı Piyasalar</h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            CANLI
          </span>
        </div>
        <Link
          href={ROUTES.CATEGORY('ekonomi')}
          className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
        >
          Ekonomi →
        </Link>
      </div>

      {loading ? (
        <MarketSkeleton />
      ) : rates ? (
        <div className="grid grid-cols-2 gap-3">
          <MarketRateCard label="Dolar" value={`₺${fmt(rates.usdTry.value, 4)}`} change={rates.usdTry.change} />
          <MarketRateCard label="Euro" value={`₺${fmt(rates.eurTry.value, 4)}`} change={rates.eurTry.change} />
          <MarketRateCard
            label="Gram Altın"
            value={`₺${fmt(rates.goldTryGram.value, 0)}`}
            change={rates.goldTryGram.change}
          />
          <MarketRateCard
            label="Bitcoin"
            value={`$${rates.btcUsd.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`}
            change={rates.btcUsd.change}
          />
          <div className="col-span-2">
            <MarketRateCard
              label="Borsa (BIST 100)"
              value={fmt(rates.bist100.value, 2)}
              change={rates.bist100.change}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-[rgb(var(--color-muted))]">Piyasa verisi şu an yüklenemedi.</p>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-[rgb(var(--color-muted))]">
        Veriler gecikmeli olabilir · 60 sn&apos;de bir güncellenir
      </p>
    </div>
  )
}
