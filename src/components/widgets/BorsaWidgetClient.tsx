'use client'

import dynamic from 'next/dynamic'

const BorsaWidget = dynamic(
  () => import('@/components/widgets/BorsaWidget').then((m) => m.BorsaWidget),
  { ssr: false }
)

export function BorsaWidgetClient() {
  return <BorsaWidget />
}
