'use client'

import dynamic from 'next/dynamic'

const FinanceTicker = dynamic(
  () => import('@/components/widgets/FinanceTicker').then((m) => m.FinanceTicker),
  { ssr: false, loading: () => <div className="h-[52px]" aria-hidden /> }
)

export function LazyFinanceTicker() {
  return <FinanceTicker />
}
