import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NewsTimeline } from '@/components/feed/NewsTimeline'
import { NewsSlider } from '@/components/widgets/NewsSlider'
import { FinanceTicker } from '@/components/widgets/FinanceTicker'
import { NewsCardSkeleton } from '@/components/ui/Skeleton'

export const metadata: Metadata = {
  title: 'Gündem | NaHaber',
  description: 'Türkiye gündeminden son dakika haberleri — NaHaber',
}

export default function FeedPage() {
  return (
    <div className="w-full">
      {/* Kaydırmalı haber slider — tam genişlik */}
      <NewsSlider categoryId="gundem" />

      {/* Kompakt döviz şeridi — sadece ana sayfada */}
      <FinanceTicker />

      <div className="mt-4" />

      <Suspense
        fallback={
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <NewsCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        {/* Ana sayfa: sadece Gündem haberleri */}
        <NewsTimeline defaultCategory="gundem" />
      </Suspense>
    </div>
  )
}
