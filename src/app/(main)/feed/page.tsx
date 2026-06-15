import type { Metadata } from 'next'
import { NewsSlider } from '@/components/widgets/NewsSlider'
import { FeedSliderHero } from '@/components/widgets/FeedSliderHero'
import { LazyFinanceTicker } from '@/components/widgets/LazyFinanceTicker'
import { FeedTimelineStatic } from '@/components/feed/FeedTimelineStatic'
import { DeferredNewsTimeline } from '@/components/feed/DeferredNewsTimeline'
import { annotateTimelinePosts } from '@/lib/newsMapper'
import { getLcpPreloadHref } from '@/lib/lcpImage'
import { getFeedSliderItems, getFeedTimelinePosts } from '@/services/newsService.server'

export const revalidate = 30

export const metadata: Metadata = {
  title: 'Gündem',
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
  const lcpPreload = lcpImage ? getLcpPreloadHref(lcpImage) : null

  return (
    <div className="w-full">
      {lcpPreload ? (
        <link rel="preload" as="image" href={lcpPreload} fetchPriority="high" />
      ) : null}

      <NewsSlider categoryId={FEED_CATEGORY} initialItems={sliderItems}>
        {sliderItems[0] ? <FeedSliderHero item={sliderItems[0]} /> : null}
      </NewsSlider>

      <LazyFinanceTicker />

      <div className="mt-4" />

      <FeedTimelineStatic posts={initialPosts} />

      <DeferredNewsTimeline
        defaultCategory={FEED_CATEGORY}
        initialPosts={initialPosts}
        initialCategoryId={FEED_CATEGORY}
        serverStaticCount={initialPosts.length}
      />
    </div>
  )
}
