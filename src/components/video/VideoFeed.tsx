'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVideoFeed } from '@/hooks/useVideoFeed'
import { useInfiniteScroll, useActiveSnapItem } from '@/hooks/useInfiniteScroll'
import { VideoFeedItem } from './VideoFeedItem'
import { ReelsRecommendations } from './ReelsRecommendations'
import { VideoSurfaceTabs } from './VideoSurfaceTabs'
import { ReelsAudioProvider } from '@/store/reelsAudioContext'
import { ROUTES } from '@/constants/routes'
import { pauseAllPageVideos } from '@/lib/videoPlayback'
import { usePageState } from '@/hooks/usePageState'
import { PAGE_STATE_KEYS } from '@/lib/stateKeys'
import type { VideoFeedSurface } from '@/lib/videoFeed/types'
import type { ReelsFeedTab } from '@/components/video/ReelsFeedTabs'

function ReelsStatePanel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-[min(72dvh,520px)] flex-col items-center justify-center gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-6 py-12 text-center shadow-sm',
        className
      )}
    >
      {children}
    </div>
  )
}

export function VideoFeed({ surface = 'reels' }: { surface?: VideoFeedSurface }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const targetVideoId = searchParams.get('v')
  const [feedTab, setFeedTab] = useState<ReelsFeedTab>('for-you')
  const [unusableIds, setUnusableIds] = useState<Set<string>>(() => new Set())
  const [activeIndexByTab, setActiveIndexByTab] = usePageState<
    Record<string, number>
  >(PAGE_STATE_KEYS.reelsActiveIndexByTab, { 'for-you': 0 })
  const hasScrolledToTargetRef = useRef(false)
  const restoredScrollRef = useRef(false)

  const {
    videos,
    loading,
    loadingMore,
    error,
    hasMore,
    activeIndex,
    setActiveIndex,
    targetIndex,
    resolvingTarget,
    loadMore,
    updateVideo,
    retry,
  } = useVideoFeed(targetVideoId, surface === 'reels' ? 'for-you' : feedTab, surface)

  const displayVideos = videos.filter((video) => !unusableIds.has(video.id))

  const handleUnusable = useCallback((id: string) => {
    setUnusableIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    loading: loadingMore,
    rootMargin: '400px',
  })

  const handleActiveChange = useCallback(
    (index: number) => {
      setActiveIndex(index)
      setActiveIndexByTab((prev) => ({ ...prev, [feedTab]: index }))
    },
    [setActiveIndex, setActiveIndexByTab, feedTab]
  )

  const awaitingTarget = Boolean(targetVideoId && resolvingTarget)

  const { containerRef, setItemRef, scrollToIndex } = useActiveSnapItem({
    onActiveChange: handleActiveChange,
    itemCount: displayVideos.length,
    suspend: awaitingTarget,
  })

  useEffect(() => {
    hasScrolledToTargetRef.current = false
    restoredScrollRef.current = false
  }, [targetVideoId])

  useEffect(() => {
    restoredScrollRef.current = false
    setUnusableIds(new Set())
  }, [feedTab])

  useLayoutEffect(() => {
    if (awaitingTarget || targetIndex === null || hasScrolledToTargetRef.current) return

    const container = containerRef.current
    if (!container) return

    const slide = container.querySelector(
      `[data-index="${targetIndex}"]`
    ) as HTMLElement | null

    if (slide) {
      container.scrollTop = slide.offsetTop
      hasScrolledToTargetRef.current = true
      return
    }

    scrollToIndex(targetIndex, 'auto')
    hasScrolledToTargetRef.current = true
  }, [awaitingTarget, targetIndex, containerRef, scrollToIndex])

  // Restore vertical scroll position when returning to reels (per tab).
  useLayoutEffect(() => {
    if (targetVideoId || awaitingTarget || displayVideos.length === 0 || restoredScrollRef.current) {
      return
    }

    const savedIndex = activeIndexByTab[feedTab] ?? 0
    const index = Math.min(Math.max(0, savedIndex), displayVideos.length - 1)
    if (index > 0) {
      scrollToIndex(index, 'auto')
      setActiveIndex(index)
    }
    restoredScrollRef.current = true
  }, [
    targetVideoId,
    awaitingTarget,
    displayVideos.length,
    feedTab,
    activeIndexByTab,
    scrollToIndex,
    setActiveIndex,
  ])

  useEffect(() => {
    return () => {
      pauseAllPageVideos()
    }
  }, [])

  useEffect(() => {
    if (pathname !== ROUTES.REELS && pathname !== ROUTES.VIDEO) {
      pauseAllPageVideos()
    }
  }, [pathname])

  useEffect(() => {
    if (loading || awaitingTarget || displayVideos.length === 0) return
    if (activeIndex >= displayVideos.length - 2 && hasMore && !loadingMore) {
      loadMore()
    }
  }, [activeIndex, displayVideos.length, hasMore, loadingMore, loadMore, loading, awaitingTarget])

  const playbackEnabled = !targetVideoId || !resolvingTarget
  const showVideoFeed =
    !loading &&
    !awaitingTarget &&
    !error &&
    displayVideos.length > 0

  return (
    <ReelsAudioProvider>
    <div className={cn('reels-page', showVideoFeed && 'reels-layout')}>
      <div
        className={cn(
          'reels-feed',
          (showVideoFeed || surface === 'video') ? 'reels-player-wrap' : 'w-full'
        )}
        data-testid="video-player-column"
      >
        {surface === 'video' ? (
          <VideoSurfaceTabs
            active={feedTab}
            onChange={(tab) => {
              setFeedTab(tab)
              setActiveIndex(0)
            }}
          />
        ) : null}
        {loading || awaitingTarget || (displayVideos.length === 0 && loadingMore) ? (
        <ReelsStatePanel>
          <Loader2 className="h-9 w-9 animate-spin text-blue-500" />
          <p className="text-sm text-[rgb(var(--color-muted))]">
            {awaitingTarget ? 'Video açılıyor...' : 'Videolar yükleniyor...'}
          </p>
        </ReelsStatePanel>
      ) : error ? (
        <ReelsStatePanel>
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">
            Video akışı yüklenemedi
          </p>
          <p className="text-sm text-[rgb(var(--color-muted))]">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Tekrar dene
          </button>
        </ReelsStatePanel>
      ) : displayVideos.length === 0 ? (
        <ReelsStatePanel>
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">
            {surface === 'video' ? 'Bu kategoride henüz video yok.' : 'Video bulunamadı'}
          </p>
          <p className="text-sm text-[rgb(var(--color-muted))]">
            {surface === 'video'
              ? 'Başka bir kategori deneyin veya daha sonra tekrar bakın.'
              : 'Henüz yayınlanmış video yok. İlk videoyu paylaşarak akışı başlat!'}
          </p>
        </ReelsStatePanel>
      ) : (
        <div
          ref={containerRef}
          className={cn(
            'reels-scroll-container',
            targetVideoId ? 'scroll-auto' : 'scroll-smooth'
          )}
          style={{ scrollSnapType: 'y mandatory' }}
        >
          {displayVideos.map((video, index) => {
            // Virtual window: render full content only for ±1 around active + 3 ahead.
            // Out-of-window items render as empty scroll-snap anchors — this prevents
            // iOS WebKit from holding dozens of <video> elements in memory simultaneously.
            const windowStart = Math.max(0, activeIndex - 1)
            const windowEnd = activeIndex + 3
            const inWindow = index >= windowStart && index <= windowEnd
            return (
              <VideoFeedItem
                key={video.id}
                video={video}
                index={index}
                isActive={playbackEnabled && index === activeIndex}
                isNext={index === activeIndex + 1}
                setItemRef={setItemRef}
                onUpdate={updateVideo}
                virtualized={!inWindow}
                surface={surface}
                onUnusable={handleUnusable}
              />
            )
          })}

          <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />

          {loadingMore && (
            <div className="flex h-16 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--color-muted))]" />
            </div>
          )}
        </div>
      )}
      </div>

      {showVideoFeed && (
        <ReelsRecommendations
          videos={displayVideos}
          activeIndex={activeIndex}
          onSelect={(index) => scrollToIndex(index)}
        />
      )}
    </div>
    </ReelsAudioProvider>
  )
}
