'use client'

import { useEffect, useState } from 'react'
import type { FinanceRates } from '@/app/api/finance/rates/route'

function arrow(up: boolean) {
  return (
    <span
      className={`inline-block text-[10px] font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}
      aria-hidden
    >
      {up ? '▲' : '▼'}
    </span>
  )
}

function fmt(n: number, decimals = 4) {
  return n.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

interface CellProps {
  label: string
  value: string
  change: number
}

function Cell({ label, value, change }: CellProps) {
  const up = change >= 0
  return (
    <div className="flex flex-col items-start gap-0.5 px-3 py-2.5 border-r border-white/10 last:border-0">
      <span className="text-[9px] font-bold uppercase tracking-widest text-white/50">{label}</span>
      <span className="text-[13px] font-black tabular-nums leading-none text-white">{value}</span>
      <div className={`flex items-center gap-0.5 text-[10px] font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {arrow(up)}
        <span>% {Math.abs(change).toFixed(2)}</span>
      </div>
    </div>
  )
}

export function FinanceTicker() {
  const [rates, setRates] = useState<FinanceRates | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/finance/rates')
      .then((r) => r.json())
      .then((d: FinanceRates) => setRates(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mb-3 h-14 w-full animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />
    )
  }

  if (!rates) return null

  return (
    <div className="mb-3 overflow-hidden rounded-xl bg-[#111318]">
      <div className="grid grid-cols-4 divide-x divide-white/10">
        <Cell
          label="DOLAR"
          value={fmt(rates.usdTry.value, 4)}
          change={rates.usdTry.change}
        />
        <Cell
          label="EURO"
          value={fmt(rates.eurTry.value, 4)}
          change={rates.eurTry.change}
        />
        <Cell
          label="BİTCOİN"
          value={`$ ${rates.btcUsd.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`}
          change={rates.btcUsd.change}
        />
        <Cell
          label="GRAM ALTIN"
          value={fmt(rates.goldTryGram.value, 3)}
          change={rates.goldTryGram.change}
        />
      </div>
    </div>
  )
}
