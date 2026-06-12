'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react'
import type { FinanceRates } from '@/app/api/finance/rates/route'

function formatValue(value: number, format: 'currency' | 'price'): string {
  if (format === 'price') {
    if (value >= 1000) {
      return value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })
    }
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
  }
  if (value >= 10000) {
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })
  }
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function RateCell({
  label,
  value,
  unit,
  change,
  format,
}: {
  label: string
  value: number
  unit: string
  change: number
  format: 'currency' | 'price'
}) {
  const up = change >= 0
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-[rgb(var(--color-surface))] p-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
        {label}
      </span>
      <span className="text-[14px] font-black tabular-nums text-[rgb(var(--color-text))]">
        {unit}{formatValue(value, format)}
      </span>
      <div className={`flex items-center gap-0.5 text-[10px] font-semibold ${up ? 'text-emerald-500' : 'text-red-500'}`}>
        {up
          ? <TrendingUp className="h-3 w-3" />
          : <TrendingDown className="h-3 w-3" />
        }
        <span>{up ? '+' : ''}{change.toFixed(2)}%</span>
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
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-[rgb(var(--color-surface))] animate-pulse" />
        ))}
      </div>
    )
  }

  if (!rates) return null

  return (
    <div className="mb-3">
      {/* Row 1: USD, EUR, Gold */}
      <div className="grid grid-cols-3 gap-2">
        <RateCell {...rates.usdTry} />
        <RateCell {...rates.eurTry} />
        <RateCell {...rates.goldTryGram} />
      </div>

      {/* Row 2: BTC + BIST button */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <RateCell {...rates.btcUsd} />
        <a
          href="https://finance.yahoo.com/quote/XU100.IS/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-1 rounded-xl bg-[rgb(var(--color-brand))] p-2.5 text-white"
        >
          <span className="text-[10px] font-bold uppercase tracking-wide">BIST 100</span>
          <div className="flex items-center gap-1 text-[12px] font-black">
            Canlı Borsa
            <ExternalLink className="h-3 w-3" />
          </div>
        </a>
      </div>

      {/* Updated time */}
      <p className="mt-1 text-right text-[9px] text-[rgb(var(--color-muted))]">
        Güncellendi: {new Date(rates.updatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  )
}
