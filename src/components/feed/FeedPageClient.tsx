'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { CategoryStoryHome } from '@/components/home/CategoryStoryHome'
import type { CategoryStoryGroup } from '@/lib/home/categoryStories'
import { TrendFeed } from '@/components/feed/TrendFeed'
import type { FeedTab } from '@/components/feed/FeedCategoryBar'
import { AdSlotProvider } from '@/context/AdSlotContext'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { useHomeFeedLiveUpdates } from '@/hooks/useHomeFeedLiveUpdates'
import type { HomeFeedInitialData } from '@/types/newsItem'

const DesktopHomeFeed = dynamic(
  () => import('@/components/home/desktop/DesktopHomeFeed').then((m) => m.DesktopHomeFeed),
  { ssr: false, loading: () => <DesktopFeedPlaceholder /> }
)
const DesktopNewspaperShell = dynamic(
  () =>
    import('@/components/home/desktop/DesktopNewspaperShell').then((m) => m.DesktopNewspaperShell),
  { ssr: false, loading: () => <DesktopFeedPlaceholder /> }
)

function DesktopFeedPlaceholder() {
  return (
    <div
      className="hidden min-h-[70vh] w-full max-w-full animate-pulse space-y-4 py-6 lg:block"
      aria-hidden
    >
      <div className="h-8 w-40 rounded bg-[rgb(var(--color-border))]" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8 aspect-[16/10] rounded-xl bg-[rgb(var(--color-border))]" />
        <div className="col-span-4 space-y-4">
          <div className="h-28 rounded-xl bg-[rgb(var(--color-border))]" />
          <div className="h-28 rounded-xl bg-[rgb(var(--color-border))]" />
          <div className="h-28 rounded-xl bg-[rgb(var(--color-border))]" />
        </div>
      </div>
    </div>
  )
}

interface FeedPageClientProps {
  homeFeedData: HomeFeedInitialData
  storyGroups?: CategoryStoryGroup[]
}

function FeedScrollHeaderConfig({ homeFeedData }: FeedPageClientProps) {
  const breakingItems =
    homeFeedData.breaking.length > 0 ? homeFeedData.breaking : homeFeedData.latest
  useScrollHeaderConfig({
    breakingItems,
    showBreaking: breakingItems.length > 0,
  })
  return null
}

function useDesktopFeedReady() {
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
        idleId = window.requestIdleCallback(enable, { timeout: 2_500 })
      } else {
        timer = setTimeout(enable, 1_200)
      }
    }

    const sync = () => {
      if (mq.matches) armDesktop()
      else {
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

  return desktopReady
}

function FeedPageBody({ homeFeedData, storyGroups = [] }: FeedPageClientProps) {
  const searchParams = useSearchParams()
  const activeTab: FeedTab = searchParams.get('tab') === 'trend' ? 'trend' : 'home'
  const liveFeedData = useHomeFeedLiveUpdates(homeFeedData)
  const desktopReady = useDesktopFeedReady()

  return (
    <>
      <FeedScrollHeaderConfig homeFeedData={liveFeedData} />

      {activeTab === 'home' && (
        <>
          <div className="lg:hidden">
            <CategoryStoryHome groups={storyGroups} />
          </div>
          <div className="hidden lg:block" data-testid="desktop-home-newspaper">
            {desktopReady ? (
              <AdSlotProvider page="home">
                <DesktopNewspaperShell>
                  <DesktopHomeFeed data={liveFeedData} />
                </DesktopNewspaperShell>
              </AdSlotProvider>
            ) : (
              <DesktopFeedPlaceholder />
            )}
          </div>
        </>
      )}
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

export function FeedPageClient({ homeFeedData, storyGroups = [] }: FeedPageClientProps) {
  return (
    <Suspense
      fallback={
        <>
          <div className="lg:hidden">
            <CategoryStoryHome groups={storyGroups} />
          </div>
          <DesktopFeedPlaceholder />
        </>
      }
    >
      <FeedPageBody homeFeedData={homeFeedData} storyGroups={storyGroups} />
    </Suspense>
  )
}
