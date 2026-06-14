import type { Metadata } from 'next'
import { NewsTimeline } from '@/components/feed/NewsTimeline'
import { FeedTimelineShell } from '@/components/feed/FeedTimelineShell'
import { FeedSliderHero } from '@/components/widgets/FeedSliderHero'
import { LazyFinanceTicker } from '@/components/widgets/LazyFinanceTicker'
import { LazyNewsSlider } from '@/components/widgets/LazyNewsSlider'
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

  return (
    <div className="w-full">
      {sliderItems[0] ? <FeedSliderHero item={sliderItems[0]} /> : null}
      <LazyNewsSlider categoryId={FEED_CATEGORY} initialItems={sliderItems} />

      <LazyFinanceTicker />

      <div className="mt-4" />

      <FeedTimelineShell posts={initialPosts} />
      <NewsTimeline
        defaultCategory={FEED_CATEGORY}
        initialPosts={initialPosts}
        initialCategoryId={FEED_CATEGORY}
        hideUntilHydrated
      />
    </div>
  )
}
