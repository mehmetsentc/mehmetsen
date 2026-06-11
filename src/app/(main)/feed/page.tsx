import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NewsTimeline } from '@/components/feed/NewsTimeline'
import { NewsSlider } from '@/components/widgets/NewsSlider'
import { PageTopWidgets } from '@/components/widgets/PageTopWidgets'
import { NewsCardSkeleton } from '@/components/ui/Skeleton'

export const metadata: Metadata = {
  title: 'Gündem | NaHaber',
  description: 'Türkiye gündeminden son dakika haberleri — NaHaber',
}

export default function FeedPage() {
  return (
    <div className="w-full">
      {/* 🖼️ Gündem haber kaydırıcısı */}
      <NewsSlider categoryId="gundem" />

      {/* 📊 Widget bölümü */}
      <PageTopWidgets />

      {/* Divider */}
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--color-muted))]">
          Son Haberler
        </span>
        <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
      </div>

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
