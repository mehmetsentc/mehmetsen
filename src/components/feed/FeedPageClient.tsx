'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { HomeFeed } from '@/components/home/HomeFeed'
import { TrendFeed } from '@/components/feed/TrendFeed'
import type { FeedTab } from '@/components/feed/FeedCategoryBar'
import { AdSlotProvider } from '@/context/AdSlotContext'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { useHomeFeedLiveUpdates } from '@/hooks/useHomeFeedLiveUpdates'
import type { HomeFeedInitialData } from '@/types/newsItem'

interface FeedPageClientProps {
  homeFeedData: HomeFeedInitialData
}

function FeedScrollHeaderConfig({ homeFeedData }: FeedPageClientProps) {
  useScrollHeaderConfig({
    breakingItems: homeFeedData.breaking,
    showBreaking: true,
  })
  return null
}

function FeedPageBody({ homeFeedData }: FeedPageClientProps) {
  const searchParams = useSearchParams()
  const activeTab: FeedTab = searchParams.get('tab') === 'trend' ? 'trend' : 'home'
  const liveFeedData = useHomeFeedLiveUpdates(homeFeedData)

  return (
    <>
      <FeedScrollHeaderConfig homeFeedData={liveFeedData} />

      {activeTab === 'home' && <HomeFeed data={liveFeedData} />}
      {activeTab === 'trend' && (
        <AdSlotProvider page="home">
          <div className="mt-2 px-0 pb-10">
            <TrendFeed items={liveFeedData.trendFeed} />
          </div>
        </AdSlotProvider>
      )}
    </>
  )
}

export function FeedPageClient({ homeFeedData }: FeedPageClientProps) {
  return (
    <Suspense fallback={<HomeFeed data={homeFeedData} />}>
      <FeedPageBody homeFeedData={homeFeedData} />
    </Suspense>
  )
}
