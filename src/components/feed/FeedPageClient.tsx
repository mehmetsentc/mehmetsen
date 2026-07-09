'use client'

import { useState } from 'react'
import { HomeFeed } from '@/components/home/HomeFeed'
import { DesktopHomeFeed } from '@/components/home/desktop/DesktopHomeFeed'
import { DesktopFeedHeader } from '@/components/home/desktop/DesktopFeedHeader'
import { DesktopHomeFooter } from '@/components/home/desktop/DesktopHomeFooter'
import { TrendFeed } from '@/components/feed/TrendFeed'
import { FeedCategoryBar, type FeedTab } from '@/components/feed/FeedCategoryBar'
import { AdSlotProvider } from '@/context/AdSlotContext'
import type { HomeFeedInitialData } from '@/types/newsItem'

interface FeedPageClientProps {
  homeFeedData: HomeFeedInitialData
}

export function FeedPageClient({ homeFeedData }: FeedPageClientProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('home')

  return (
    <>
      {/* Mobil + tablet — mevcut akış */}
      <div className="lg:hidden">
        <FeedCategoryBar activeTab={activeTab} onTabChange={setActiveTab} />
        {activeTab === 'home' && <HomeFeed data={homeFeedData} />}
        {activeTab === 'trend' && (
          <div className="mt-4">
            <TrendFeed items={homeFeedData.trendFeed} />
          </div>
        )}
      </div>

      {/* Web (lg+) — BBC / NYT tarzı geniş düzen */}
      <div className="hidden lg:block desktop-newspaper">
        <AdSlotProvider page="home">
          <DesktopFeedHeader breakingItems={homeFeedData.breaking} />
          {activeTab === 'home' && <DesktopHomeFeed data={homeFeedData} />}
          {activeTab === 'trend' && (
            <div className="pb-10">
              <div className="mb-4 border-b-2 border-[rgb(var(--color-text))] pb-1">
                <h2 className="font-serif text-xl font-bold text-[rgb(var(--color-text))]">Trend Haberler</h2>
              </div>
              <TrendFeed items={homeFeedData.trendFeed} hideHeader />
            </div>
          )}
          {activeTab === 'home' ? null : <DesktopHomeFooter />}
        </AdSlotProvider>
      </div>
    </>
  )
}
