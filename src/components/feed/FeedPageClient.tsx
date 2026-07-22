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

/**
 * Desktop shell is heavy (TBT). Keep the SSR mobile tree as LCP until idle,
 * then swap to the desktop newspaper layout.
 */
function useDesktopFeedReady() {
  const [isLg, setIsLg] = useState(false)
  const [desktopReady, setDesktopReady] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    let idleId: number | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const clearIdle = () => {
      if (idleId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      idleId = null
    }

    const armDesktop = () => {
      clearIdle()
      const enable = () => setDesktopReady(true)
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(enable, { timeout: 2_000 })
      } else {
        timer = setTimeout(enable, 1_200)
      }
    }

    const sync = () => {
      const matches = mq.matches
      setIsLg(matches)
      if (matches) {
        armDesktop()
      } else {
        clearIdle()
        setDesktopReady(false)
      }
    }

    sync()
    mq.addEventListener('change', sync)
    return () => {
      mq.removeEventListener('change', sync)
      clearIdle()
    }
  }, [])

  return isLg && desktopReady
}

export function FeedPageClient({ homeFeedData }: FeedPageClientProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('home')
  const liveFeedData = useHomeFeedLiveUpdates(homeFeedData)
  const showDesktop = useDesktopFeedReady()

  return (
    <>
      <FeedScrollHeaderConfig homeFeedData={homeFeedData} />

      {/* Mobile/SSR tree — also the LCP path for desktop until idle swap. */}
      {!showDesktop ? (
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

      {showDesktop ? (
        <AdSlotProvider page="home">
          {activeTab === 'home' ? (
            <DesktopNewspaperShell>
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
        </AdSlotProvider>
      ) : null}
    </>
  )
}
