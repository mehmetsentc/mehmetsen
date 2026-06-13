'use client'

import dynamic from 'next/dynamic'
import { TICKER_HEIGHT_CLASS } from '@/components/widgets/financeTickerConstants'

const FinanceTicker = dynamic(
  () => import('@/components/widgets/FinanceTicker').then((m) => m.FinanceTicker),
  {
    ssr: false,
    loading: () => (
      <div
        className={`${TICKER_HEIGHT_CLASS} w-full animate-pulse bg-[rgb(var(--color-surface))]`}
        style={{
          margin: '0 calc(-1 * var(--layout-gutter))',
          width: 'calc(100% + 2 * var(--layout-gutter))',
        }}
        aria-hidden
      />
    ),
  }
)

export function LazyFinanceTicker() {
  return <FinanceTicker />
}
