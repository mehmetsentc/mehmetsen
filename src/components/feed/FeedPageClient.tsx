'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { HomeFeed } from '@/components/home/HomeFeed'
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
      className="mx-auto hidden min-h-[70vh] w-full max-w-6xl animate-pulse space-y-4 px-4 py-6 lg:block"
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
      <div className="grid grid-cols-3 gap-4">
        <div className="aspect-[16/10] rounded-xl bg-[rgb(var(--color-border))]" />
        <div className="aspect-[16/10] rounded-xl bg-[rgb(var(--color-border))]" />
        <div className="aspect-[16/10] rounded-xl bg-[rgb(var(--color-border))]" />
      </div>
    </div>
  )
}

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
 * Desktop shell: lg+ CSS ile mobil ağacı gizle (yanlış layout → CLS yok).
 * Desktop bundle idle sonrası yüklenir; yer tutucu aynı grid’i rezerve eder.
 */
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

function FeedPageBody({ homeFeedData }: FeedPageClientProps) {
  const searchParams = useSearchParams()
  const activeTab: FeedTab = searchParams.get('tab') === 'trend' ? 'trend' : 'home'
  const liveFeedData = useHomeFeedLiveUpdates(homeFeedData)
  const desktopReady = useDesktopFeedReady()

  return (
    <>
      <FeedScrollHeaderConfig homeFeedData={liveFeedData} />

      {/* Mobil — lg altında görünür; Ana Sayfa/Trend alt şeridi kaldırıldı (chrome sade) */}
      <div className="lg:hidden">
        {activeTab === 'home' && <HomeFeed data={liveFeedData} />}
        {activeTab === 'trend' && (
          <div className="mt-2 px-0">
            <TrendFeed items={liveFeedData.trendFeed} />
          </div>
        )}
      </div>

      {/* Masaüstü — CSS ile ilk paint’ten itibaren ayrılır (mobil flash yok) */}
      <div className="hidden lg:block">
        <AdSlotProvider page="home">
          {activeTab === 'home' ? (
            desktopReady ? (
              <DesktopNewspaperShell>
                <DesktopHomeFeed data={liveFeedData} />
              </DesktopNewspaperShell>
            ) : (
              <DesktopFeedPlaceholder />
            )
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
      </div>
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
