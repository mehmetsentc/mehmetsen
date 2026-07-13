'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import type { FinanceRates } from '@/app/api/finance/rates/route'
import { ROUTES } from '@/constants/routes'

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

interface TickerItem {
  label: string
  value: string
  change: number
}

function TickerCell({ label, value, change }: TickerItem) {
  const up = change >= 0
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 px-4">
      <span className="text-[11px] font-bold uppercase tracking-wider text-[rgb(var(--color-muted))]">
        {label}
      </span>
      <span className="text-[12px] font-black tabular-nums text-[rgb(var(--color-text))]">
        {value}
      </span>
      <span className={`text-[11px] font-bold tabular-nums ${up ? 'text-emerald-500' : 'text-red-500'}`}>
        {up ? '▲' : '▼'} %{Math.abs(change).toFixed(2)}
      </span>
    </span>
  )
}

export function DesktopMarketTicker() {
  const [rates, setRates] = useState<FinanceRates | null>(null)

  useEffect(() => {
    const load = () => {
      fetch('/api/finance/rates')
        .then((r) => (r.ok ? r.json() : null))
        .then((d: FinanceRates | null) => { if (d) setRates(d) })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [])

  if (!rates) return null

  const items: TickerItem[] = [
    { label: 'USD/TL', value: `₺${fmt(rates.usdTry.value, 4)}`, change: rates.usdTry.change },
    { label: 'EUR/TL', value: `₺${fmt(rates.eurTry.value, 4)}`, change: rates.eurTry.change },
    { label: 'Altın', value: `₺${fmt(rates.goldTryGram.value, 0)}`, change: rates.goldTryGram.change },
    { label: 'BTC', value: `$${rates.btcUsd.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`, change: rates.btcUsd.change },
    { label: 'BIST 100', value: fmt(rates.bist100.value, 2), change: rates.bist100.change },
  ]

  return (
    <div className="mb-4 flex items-center gap-0 overflow-hidden border-y border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
      <Link
        href={ROUTES.CATEGORY('ekonomi')}
        className="flex shrink-0 items-center gap-1.5 border-r border-[rgb(var(--color-border))] bg-[rgb(var(--color-brand))] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-white"
        aria-label="Piyasalar"
      >
        <TrendingUp className="h-3 w-3" aria-hidden />
        Piyasalar
      </Link>
      <div className="flex min-w-0 flex-1 overflow-x-auto scrollbar-none py-1.5">
        <div className="flex divide-x divide-[rgb(var(--color-border))]">
          {items.map((item) => (
            <TickerCell key={item.label} {...item} />
          ))}
        </div>
      </div>
    </div>
  )
}
