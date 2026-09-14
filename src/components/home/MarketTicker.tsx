'use client'

import { useEffect, useState } from 'react'
import type { FinanceRates } from '@/app/api/finance/rates/route'
import { cn } from '@/lib/utils'

interface MarketCellProps {
  label: string
  value: string
  change: number
  attached?: boolean
}

function MarketCell({ label, value, change, attached = false }: MarketCellProps) {
  const up = change >= 0
  const pct = Math.abs(change).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col border-r last:border-r-0',
        attached
          ? 'gap-0.5 border-white/10 px-2 py-3'
          : 'border-[rgb(var(--color-border))] gap-0.5 px-3 py-2.5 max-md:gap-1 max-md:border-[rgb(var(--color-border))]/60 max-md:px-2.5 max-md:py-3.5'
      )}
    >
      <span
        className={cn(
          'truncate font-bold uppercase tracking-wider',
          attached
            ? 'text-[10px] text-white/70'
            : 'text-[10px] text-[rgb(var(--color-muted))] max-md:text-[11px]'
        )}
      >
        {label} {up ? '▲' : '▼'}
      </span>
      <span
        className={cn(
          'truncate font-black tabular-nums leading-tight',
          attached
            ? 'text-[13px] text-white'
            : 'text-[13px] text-[rgb(var(--color-text))] max-md:text-[14px]'
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          'text-[11px] font-semibold tabular-nums max-md:text-[12px]',
          up ? 'text-emerald-500' : 'text-red-500'
        )}
      >
        % {up ? '' : '-'}
        {pct}
      </span>
    </div>
  )
}

function MarketCellSkeleton({ label, attached }: { label: string; attached?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 border-r last:border-r-0',
        attached
          ? 'border-white/10 px-2 py-3'
          : 'border-[rgb(var(--color-border))]/60 px-2.5 py-3.5 md:px-3 md:py-2.5'
      )}
    >
      <span
        className={cn(
          'truncate text-[10px] font-bold uppercase tracking-wider',
          attached ? 'text-white/70' : 'text-[rgb(var(--color-muted))]'
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'h-[15px] w-3/4 animate-pulse rounded',
          attached ? 'bg-white/15' : 'bg-[rgb(var(--color-border))]'
        )}
      />
      <span
        className={cn(
          'h-[12px] w-1/2 animate-pulse rounded',
          attached ? 'bg-white/10' : 'bg-[rgb(var(--color-border))]'
        )}
      />
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

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function MarketTicker({ attached = false }: { attached?: boolean } = {}) {
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
      className={cn(
        'home-full-bleed',
        attached
          ? 'home-market-ticker home-market-ticker--attached'
          : 'bg-[rgb(var(--color-card))] md:home-contained md:rounded-xl max-md:mt-1'
      )}
      aria-label="Piyasalar"
      style={
        attached
          ? undefined
          : {
              borderTop: '1px solid rgb(var(--color-brand) / 0.35)',
              borderBottom: '1px solid rgb(var(--color-border))',
            }
      }
    >
      <div className={cn('grid grid-cols-4', !attached && 'max-md:min-h-[108px]')}>
        {rates ? (
          <>
            <MarketCell
              attached={attached}
              label="Dolar"
              value={fmt(rates.usdTry.value, 2)}
              change={rates.usdTry.change}
            />
            <MarketCell
              attached={attached}
              label="Euro"
              value={fmt(rates.eurTry.value, 2)}
              change={rates.eurTry.change}
            />
            <MarketCell
              attached={attached}
              label="Bitcoin"
              value={`$ ${rates.btcUsd.value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              change={rates.btcUsd.change}
            />
            <MarketCell
              attached={attached}
              label="Gram Altın"
              value={fmt(rates.goldTryGram.value, 2)}
              change={rates.goldTryGram.change}
            />
          </>
        ) : (
          <>
            <MarketCellSkeleton attached={attached} label="Dolar" />
            <MarketCellSkeleton attached={attached} label="Euro" />
            <MarketCellSkeleton attached={attached} label="Bitcoin" />
            <MarketCellSkeleton attached={attached} label="Gram Altın" />
          </>
        )}
      </div>
    </section>
  )
}
