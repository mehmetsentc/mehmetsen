'use client'

import { useState } from 'react'
import { HomeFeed } from '@/components/home/HomeFeed'
import { PersonalFeed } from '@/components/feed/PersonalFeed'
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

      {activeTab === 'personal' && (
        <div className="mt-4">
          <PersonalFeed />
        </div>
      )}
    </>
  )
}
