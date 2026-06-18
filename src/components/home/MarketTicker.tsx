'use client'

import { useEffect, useState } from 'react'
import type { FinanceRates } from '@/app/api/finance/rates/route'

interface MarketCellProps {
  label: string
  value: string
  change: number
}

function MarketCell({ label, value, change }: MarketCellProps) {
  const up = change >= 0
  return (
    <div className="flex min-w-[140px] shrink-0 flex-col gap-0.5 border-r border-white/10 px-4 py-3 last:border-r-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">{label}</span>
      <span className="text-sm font-black tabular-nums text-white">{value}</span>
      <span className={`text-[11px] font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? '+' : ''}
        {change.toFixed(2)}%
      </span>
    </div>
  )
}

const MOCK_RATES: FinanceRates = {
  usdTry: { label: 'Dolar', value: 34.25, unit: '₺', change: 0.18, format: 'currency' },
  eurTry: { label: 'Euro', value: 37.12, unit: '₺', change: -0.42, format: 'currency' },
  btcUsd: { label: 'Bitcoin', value: 64327, unit: '$', change: -1.85, format: 'price' },
  goldTryGram: { label: 'Gram Altın', value: 2850.5, unit: '₺', change: -0.65, format: 'currency' },
  updatedAt: Date.now(),
}

function fmt(n: number, decimals = 4) {
  return n.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function MarketTicker() {
  const [rates, setRates] = useState<FinanceRates>(MOCK_RATES)

  useEffect(() => {
    fetch('/api/finance/rates')
      .then((r) => (r.ok ? r.json() : MOCK_RATES))
      .then((d: FinanceRates) => setRates(d))
      .catch(() => setRates(MOCK_RATES))
  }, [])

  return (
    <section className="home-full-bleed bg-neutral-950 md:home-contained md:rounded-xl" aria-label="Piyasalar">
      <div className="flex overflow-x-auto scrollbar-hide">
        <MarketCell label="Dolar" value={fmt(rates.usdTry.value, 4)} change={rates.usdTry.change} />
        <MarketCell label="Euro" value={fmt(rates.eurTry.value, 4)} change={rates.eurTry.change} />
        <MarketCell
          label="Bitcoin"
          value={`$${rates.btcUsd.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`}
          change={rates.btcUsd.change}
        />
        <MarketCell label="Gram Altın" value={fmt(rates.goldTryGram.value, 2)} change={rates.goldTryGram.change} />
      </div>
    </section>
  )
}
