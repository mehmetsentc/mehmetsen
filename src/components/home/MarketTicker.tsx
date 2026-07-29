'use client'

import { useEffect, useState } from 'react'
import type { FinanceRates } from '@/app/api/finance/rates/route'
import { cn } from '@/lib/utils'

interface MarketCellProps {
  label: string
  value: string
  change: number
}

function MarketCell({ label, value, change }: MarketCellProps) {
  const up = change >= 0
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col border-r border-[rgb(var(--color-border))] last:border-r-0',
        'gap-0.5 px-3 py-2.5',
        'max-md:gap-1 max-md:border-[rgb(var(--color-border))]/60 max-md:px-2.5 max-md:py-3.5'
      )}
    >
      <span className="truncate text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-muted))] max-md:text-[11px]">
        {label}
      </span>
      <span className="truncate text-[13px] font-black tabular-nums leading-tight text-[rgb(var(--color-text))] max-md:text-[14px]">
        {value}
      </span>
      <span
        className={cn(
          'text-[11px] font-semibold tabular-nums max-md:text-[12px]',
          up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
        )}
      >
        {up ? '+' : ''}
        {change.toFixed(2)}%
      </span>
    </div>
  )
}

function MarketCellSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1 border-r border-[rgb(var(--color-border))]/60 px-2.5 py-3.5 last:border-r-0 md:gap-1 md:px-3 md:py-2.5">
      <span className="truncate text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-muted))]">
        {label}
      </span>
      <span className="h-[15px] w-3/4 animate-pulse rounded bg-[rgb(var(--color-border))]" />
      <span className="h-[12px] w-1/2 animate-pulse rounded bg-[rgb(var(--color-border))]" />
    </div>
  )
}

const MOCK_RATES: FinanceRates = {
  usdTry: { label: 'Dolar', value: 34.25, unit: '₺', change: 0.18, format: 'currency' },
  eurTry: { label: 'Euro', value: 37.12, unit: '₺', change: -0.42, format: 'currency' },
  btcUsd: { label: 'Bitcoin', value: 64327, unit: '$', change: -1.85, format: 'price' },
  goldTryGram: { label: 'Gram Altın', value: 2850.5, unit: '₺', change: -0.65, format: 'currency' },
  bist100: { label: 'BIST 100', value: 9842.5, unit: '', change: 0.42, format: 'price' },
  updatedAt: Date.now(),
}

function fmt(n: number, decimals = 4) {
  return n.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function MarketTicker() {
  // Start empty so we never flash fabricated rates; show a skeleton until the
  // real quotes arrive (MOCK_RATES is only an error fallback).
  const [rates, setRates] = useState<FinanceRates | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/finance/rates')
      .then((r) => (r.ok ? r.json() : MOCK_RATES))
      .then((d: FinanceRates) => {
        if (active) setRates(d)
      })
      .catch(() => {
        if (active) setRates(MOCK_RATES)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <section
      className="home-full-bleed bg-[rgb(var(--color-card))] md:home-contained md:rounded-xl max-md:mt-1"
      aria-label="Piyasalar"
      style={{
        borderTop: '1px solid rgb(var(--color-brand) / 0.35)',
        borderBottom: '1px solid rgb(var(--color-border))',
      }}
    >
      <div className="grid grid-cols-4 max-md:min-h-[108px]">
        {rates ? (
          <>
            <MarketCell label="Dolar" value={fmt(rates.usdTry.value, 4)} change={rates.usdTry.change} />
            <MarketCell label="Euro" value={fmt(rates.eurTry.value, 4)} change={rates.eurTry.change} />
            <MarketCell
              label="Bitcoin"
              value={`$${rates.btcUsd.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`}
              change={rates.btcUsd.change}
            />
            <MarketCell
              label="Gram Altın"
              value={fmt(rates.goldTryGram.value, 2)}
              change={rates.goldTryGram.change}
            />
          </>
        ) : (
          <>
            <MarketCellSkeleton label="Dolar" />
            <MarketCellSkeleton label="Euro" />
            <MarketCellSkeleton label="Bitcoin" />
            <MarketCellSkeleton label="Gram Altın" />
          </>
        )}
      </div>
    </section>
  )
}
