'use client'

import dynamic from 'next/dynamic'

const BoxOfficeWeeklyWidget = dynamic(
  () =>
    import('@/components/widgets/BoxOfficeWeeklyWidget').then(
      (m) => m.BoxOfficeWeeklyWidget
    ),
  { ssr: false }
)

export function BoxOfficeWeeklyWidgetClient() {
  return <BoxOfficeWeeklyWidget />
}
