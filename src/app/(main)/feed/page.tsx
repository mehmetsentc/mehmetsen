import type { Metadata } from 'next'
import { NewsSlider } from '@/components/widgets/NewsSlider'
import { FeedSliderHero } from '@/components/widgets/FeedSliderHero'
import { BreakingNewsSlider } from '@/components/widgets/BreakingNewsSlider'
import { BreakingNewsFeed } from '@/components/feed/BreakingNewsFeed'
import { LazyFinanceTicker } from '@/components/widgets/LazyFinanceTicker'
import { FeedTimelineStatic } from '@/components/feed/FeedTimelineStatic'
import { DeferredNewsTimeline } from '@/components/feed/DeferredNewsTimeline'
import { annotateTimelinePosts } from '@/lib/newsMapper'
import { getSiteUrl } from '@/lib/seo'
import { getLcpPreloadHref } from '@/lib/lcpImage'
import { getBreakingSliderItems, getFeedSliderItems, getFeedTimelinePosts } from '@/services/newsService.server'
import { ROUTES } from '@/constants/routes'

export const revalidate = 30

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Gündem — Son Dakika Haberler',
  description: 'Türkiye gündeminden son dakika haberleri, güncel gelişmeler ve editoryal içerik — NaHaber',
  alternates: {
    canonical: `${siteUrl}${ROUTES.FEED}`,
  },
  openGraph: {
    title: 'Gündem — Son Dakika Haberler | NaHaber',
    description: 'Türkiye gündeminden son dakika haberleri — NaHaber',
    url: `${siteUrl}${ROUTES.FEED}`,
    type: 'website',
  },
}

const FEED_CATEGORY = 'gundem'

export default async function FeedPage() {
  const [sliderItems, breakingItems, timelinePosts] = await Promise.all([
    getFeedSliderItems(FEED_CATEGORY, 5),
    getBreakingSliderItems(5),
    getFeedTimelinePosts(FEED_CATEGORY, 10, 'nahaber'),
  ])

  const initialPosts = annotateTimelinePosts(timelinePosts, new Set())
  const heroItem = breakingItems[0] ?? sliderItems[0]
  const lcpImage = heroItem?.imageUrl
  const lcpPreload = lcpImage ? getLcpPreloadHref(lcpImage) : null
  const hasBreaking = breakingItems.length > 0

  return (
    <div className="w-full">
      {lcpPreload ? (
        <link rel="preload" as="image" href={lcpPreload} fetchPriority="high" />
      ) : null}

      {/* Mobil: son dakika slider */}
      {hasBreaking ? (
        <div className="md:hidden">
          <BreakingNewsSlider initialItems={breakingItems} />
        </div>
      ) : (
        <div className="md:hidden">
          <NewsSlider categoryId={FEED_CATEGORY} initialItems={sliderItems}>
            {sliderItems[0] ? <FeedSliderHero item={sliderItems[0]} /> : null}
          </NewsSlider>
        </div>
      )}

      {/* Masaüstü: gündem slider */}
      <div className="hidden md:block">
        <NewsSlider categoryId={FEED_CATEGORY} initialItems={sliderItems}>
          {sliderItems[0] ? <FeedSliderHero item={sliderItems[0]} /> : null}
        </NewsSlider>
      </div>

      <LazyFinanceTicker />

      <BreakingNewsFeed />

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
