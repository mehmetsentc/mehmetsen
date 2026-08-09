'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { HomeFeed } from '@/components/home/HomeFeed'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import type { HomeFeedInitialData, HomeCategorySlug } from '@/types/newsItem'

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
    </div>
  )
}

interface CityFeedPageClientProps {
  homeFeedData: HomeFeedInitialData
  cityName: string
}

function CityFeedScrollHeaderConfig({ homeFeedData }: { homeFeedData: HomeFeedInitialData }) {
  useScrollHeaderConfig({
    breakingItems: homeFeedData.breaking,
    showBreaking: true,
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

function CityFeedPageBody({ homeFeedData, cityName }: CityFeedPageClientProps) {
  const desktopReady = useDesktopFeedReady()
  const categoryRailIds = Object.keys(homeFeedData.categoryRails) as HomeCategorySlug[]

  return (
    <>
      <CityFeedScrollHeaderConfig homeFeedData={homeFeedData} />

      <div className="lg:hidden">
        <HomeFeed
          data={homeFeedData}
          cityMode
          categoryRailIds={categoryRailIds}
        />
      </div>

      <div className="hidden lg:block">
        {desktopReady ? (
          <DesktopNewspaperShell>
            <DesktopHomeFeed data={homeFeedData} cityMode cityName={cityName} />
          </DesktopNewspaperShell>
        ) : (
          <DesktopFeedPlaceholder />
        )}
      </div>
    </>
  )
}

export function CityFeedPageClient(props: CityFeedPageClientProps) {
  return (
    <Suspense fallback={<HomeFeed data={props.homeFeedData} cityMode />}>
      <CityFeedPageBody {...props} />
    </Suspense>
  )
}
