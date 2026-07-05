'use client'

import { useState } from 'react'
import { HomeFeed } from '@/components/home/HomeFeed'
import { TrendFeed } from '@/components/feed/TrendFeed'
import { FeedCategoryBar, type FeedTab } from '@/components/feed/FeedCategoryBar'
import type { HomeFeedInitialData } from '@/types/newsItem'

interface FeedPageClientProps {
  homeFeedData: HomeFeedInitialData
}

export function FeedPageClient({ homeFeedData }: FeedPageClientProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('home')

  return (
    <>
      <FeedCategoryBar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'home' && <HomeFeed data={homeFeedData} />}

      {activeTab === 'trend' && (
        <div className="mt-4">
          <TrendFeed items={homeFeedData.trendFeed} />
        </div>
      )}
    </>
  )
}
