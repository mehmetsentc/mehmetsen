'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { HomeFeed } from '@/components/home/HomeFeed'
import { TrendFeed } from '@/components/feed/TrendFeed'
import { FeedCategoryBar, type FeedTab } from '@/components/feed/FeedCategoryBar'
import { AdSlotProvider } from '@/context/AdSlotContext'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { useHomeFeedLiveUpdates } from '@/hooks/useHomeFeedLiveUpdates'
import type { HomeFeedInitialData } from '@/types/newsItem'

const DesktopHomeFeed = dynamic(
  () => import('@/components/home/desktop/DesktopHomeFeed').then((m) => m.DesktopHomeFeed),
  { ssr: false, loading: () => null }
)
const DesktopNewspaperShell = dynamic(
  () =>
    import('@/components/home/desktop/DesktopNewspaperShell').then((m) => m.DesktopNewspaperShell),
  { ssr: false, loading: () => null }
)
const DesktopHomeFooter = dynamic(
  () => import('@/components/home/desktop/DesktopHomeFooter').then((m) => m.DesktopHomeFooter),
  { ssr: false, loading: () => null }
)

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

function useIsDesktopLg() {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return isDesktop
}

export function FeedPageClient({ homeFeedData }: FeedPageClientProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('home')
  const liveFeedData = useHomeFeedLiveUpdates(homeFeedData)
  const isDesktop = useIsDesktopLg()

  return (
    <>
      <FeedScrollHeaderConfig homeFeedData={homeFeedData} />

      {/* Mobile/tablet: always SSR + hydrate (lighter critical path). */}
      {!isDesktop ? (
        <div>
          <FeedCategoryBar activeTab={activeTab} onTabChange={setActiveTab} />
          {activeTab === 'home' && <HomeFeed data={liveFeedData} />}
          {activeTab === 'trend' && (
            <div className="mt-4">
              <TrendFeed items={liveFeedData.trendFeed} />
            </div>
          )}
        </div>
      ) : null}

      {/* Desktop: client-only — avoids shipping dual DOM/images in initial HTML. */}
      {isDesktop ? (
        <AdSlotProvider page="home">
          {activeTab === 'home' ? (
            <DesktopNewspaperShell footer={<DesktopHomeFooter />}>
              <DesktopHomeFeed data={liveFeedData} />
            </DesktopNewspaperShell>
          ) : null}
          {activeTab === 'trend' && (
            <div className="pb-10">
              <div className="mb-4 border-b-2 border-[rgb(var(--color-text))] pb-1">
                <h2 className="font-serif text-xl font-bold text-[rgb(var(--color-text))]">
                  Trend Haberler
                </h2>
              </div>
              <TrendFeed items={liveFeedData.trendFeed} hideHeader />
            </div>
          )}
          {activeTab === 'home' ? null : <DesktopHomeFooter />}
        </AdSlotProvider>
      ) : null}
    </>
  )
}
