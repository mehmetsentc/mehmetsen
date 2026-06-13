import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NewsTimeline } from '@/components/feed/NewsTimeline'
import { NewsSlider } from '@/components/widgets/NewsSlider'
import { FeedSliderHero } from '@/components/widgets/FeedSliderHero'
import { LazyFinanceTicker } from '@/components/widgets/LazyFinanceTicker'
import { NewsCardSkeleton } from '@/components/ui/Skeleton'
import { annotateTimelinePosts } from '@/lib/newsMapper'
import { getFeedSliderItems, getFeedTimelinePosts } from '@/services/newsService.server'

export const revalidate = 30

export const metadata: Metadata = {
  title: 'Gündem | NaHaber',
  description: 'Türkiye gündeminden son dakika haberleri — NaHaber',
}

const FEED_CATEGORY = 'gundem'

export default async function FeedPage() {
  const [sliderItems, timelinePosts] = await Promise.all([
    getFeedSliderItems(FEED_CATEGORY, 5),
    getFeedTimelinePosts(FEED_CATEGORY, 10, 'nahaber'),
  ])

  const initialPosts = annotateTimelinePosts(timelinePosts, new Set())
  const lcpImage = sliderItems[0]?.imageUrl

  return (
    <div className="w-full">
      {lcpImage ? (
        <link rel="preload" as="image" href={lcpImage} fetchPriority="high" />
      ) : null}

      <NewsSlider categoryId={FEED_CATEGORY} initialItems={sliderItems}>
        {sliderItems[0] ? <FeedSliderHero item={sliderItems[0]} /> : null}
      </NewsSlider>

      <LazyFinanceTicker />

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
        <NewsTimeline
          defaultCategory={FEED_CATEGORY}
          initialPosts={initialPosts}
          initialCategoryId={FEED_CATEGORY}
        />
      </Suspense>
    </div>
  )
}
