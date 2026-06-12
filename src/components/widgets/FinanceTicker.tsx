'use client'

import { useEffect, useState } from 'react'
import type { FinanceRates } from '@/app/api/finance/rates/route'

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
    <div className="flex flex-col gap-0.5 px-3 py-3">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-muted))]">{label}</span>
        <span className={`text-[10px] font-bold ${up ? 'text-emerald-500' : 'text-red-500'}`}>
          {up ? '▲' : '▼'}
        </span>
      </div>
      <span className="text-[15px] font-black tabular-nums leading-none text-[rgb(var(--color-text))]">
        {value}
      </span>
      <span className={`text-[11px] font-semibold tabular-nums ${up ? 'text-emerald-500' : 'text-red-500'}`}>
        % {change >= 0 ? '+' : ''}{change.toFixed(2)}
      </span>
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
    return <div className="h-16 w-full animate-pulse bg-[rgb(var(--color-surface))]" />
  }

  if (!rates) return null

  return (
    <div
      className="border-b border-t border-[rgb(var(--color-border))]"
      style={{
        margin: '0 calc(-1 * var(--layout-gutter))',
        width: 'calc(100% + 2 * var(--layout-gutter))',
      }}
    >
      <div className="grid grid-cols-4 divide-x divide-[rgb(var(--color-border))]">
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
          value={`$${rates.btcUsd.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`}
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
