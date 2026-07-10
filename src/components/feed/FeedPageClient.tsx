'use client'

import { useState } from 'react'
import { HomeFeed } from '@/components/home/HomeFeed'
import { DesktopHomeFeed } from '@/components/home/desktop/DesktopHomeFeed'
import { DesktopRightRail } from '@/components/home/desktop/DesktopRightRail'
import { DesktopHomeFooter } from '@/components/home/desktop/DesktopHomeFooter'
import { TrendFeed } from '@/components/feed/TrendFeed'
import { FeedCategoryBar, type FeedTab } from '@/components/feed/FeedCategoryBar'
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

export function FeedPageClient({ homeFeedData }: FeedPageClientProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('home')
  const liveFeedData = useHomeFeedLiveUpdates(homeFeedData)

  return (
    <>
      <FeedScrollHeaderConfig homeFeedData={homeFeedData} />

      {/* Mobil + tablet — mevcut akış */}
      <div className="lg:hidden">
        <FeedCategoryBar activeTab={activeTab} onTabChange={setActiveTab} />
        {activeTab === 'home' && <HomeFeed data={liveFeedData} />}
        {activeTab === 'trend' && (
          <div className="mt-4">
            <TrendFeed items={liveFeedData.trendFeed} />
          </div>
        )}
      </div>

      {/* Web (lg+) — BBC / NYT tarzı geniş düzen + xl yan sütun */}
      <div className="hidden lg:block">
        <AdSlotProvider page="home">
          {activeTab === 'home' ? (
            <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_var(--layout-rail)] xl:items-start xl:gap-[var(--layout-gutter)]">
              <div className="min-w-0">
                <DesktopHomeFeed data={liveFeedData} />
              </div>
              <DesktopRightRail
                mostRead={liveFeedData.mostRead}
                className="hidden xl:block"
              />
            </div>
          ) : null}
          {activeTab === 'trend' && (
            <div className="pb-10">
              <div className="mb-4 border-b-2 border-[rgb(var(--color-text))] pb-1">
                <h2 className="font-serif text-xl font-bold text-[rgb(var(--color-text))]">Trend Haberler</h2>
              </div>
              <TrendFeed items={liveFeedData.trendFeed} hideHeader />
            </div>
          )}
          {activeTab === 'home' ? null : <DesktopHomeFooter />}
        </AdSlotProvider>
      </div>
    </>
  )
}
