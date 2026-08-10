'use client'

import dynamic from 'next/dynamic'

const BoxOfficeWeeklyWidget = dynamic(
  () =>
    import('@/components/widgets/BoxOfficeWeeklyWidget').then(
      (m) => m.BoxOfficeWeeklyWidget
    ),
  { ssr: false }
)

interface BoxOfficeWeeklyWidgetClientProps {
  variant?: 'default' | 'compact'
}

export function BoxOfficeWeeklyWidgetClient({
  variant = 'default',
}: BoxOfficeWeeklyWidgetClientProps) {
  return <BoxOfficeWeeklyWidget variant={variant} />
}
