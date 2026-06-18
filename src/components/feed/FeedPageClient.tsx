'use client'

import { useState } from 'react'
import { HomeFeed } from '@/components/home/HomeFeed'
import { CategoryFeed } from '@/components/feed/CategoryFeed'
import { FeedCategoryBar, type FeedTab } from '@/components/feed/FeedCategoryBar'
import type { HomeFeedInitialData } from '@/types/newsItem'
import type { TimelinePost } from '@/types/post'

interface FeedPageClientProps {
  homeFeedData: HomeFeedInitialData
  gundemInitialPosts: TimelinePost[]
}

export function FeedPageClient({ homeFeedData, gundemInitialPosts }: FeedPageClientProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('home')

  return (
    <>
      <FeedCategoryBar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'home' ? (
        <HomeFeed data={homeFeedData} />
      ) : (
        <div className="mt-4">
          <CategoryFeed categoryId="gundem" initialPosts={gundemInitialPosts} />
        </div>
      )}
    </>
  )
}
