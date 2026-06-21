'use client'

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useVideoFeed } from '@/hooks/useVideoFeed'
import { useInfiniteScroll, useActiveSnapItem } from '@/hooks/useInfiniteScroll'
import { VideoFeedItem } from './VideoFeedItem'
import { ReelsFeedTabs, type ReelsFeedTab } from './ReelsFeedTabs'
import { ReelsRecommendations } from './ReelsRecommendations'
import { ReelsAudioProvider } from '@/store/reelsAudioContext'
import { ROUTES } from '@/constants/routes'
import { pauseAllPageVideos } from '@/lib/videoPlayback'
import { usePageState } from '@/hooks/usePageState'
import { PAGE_STATE_KEYS } from '@/lib/stateKeys'

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

export function VideoFeed() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const targetVideoId = searchParams.get('v')
  const [feedTab, setFeedTab] = usePageState<ReelsFeedTab>(
    PAGE_STATE_KEYS.reelsFeedTab,
    'for-you'
  )
  const [activeIndexByTab, setActiveIndexByTab] = usePageState<
    Record<ReelsFeedTab, number>
  >(PAGE_STATE_KEYS.reelsActiveIndexByTab, { 'for-you': 0, following: 0 })
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
  } = useVideoFeed(targetVideoId, feedTab)

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
    itemCount: videos.length,
    suspend: awaitingTarget,
  })

  useEffect(() => {
    hasScrolledToTargetRef.current = false
    restoredScrollRef.current = false
  }, [targetVideoId])

  useEffect(() => {
    restoredScrollRef.current = false
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
    if (targetVideoId || awaitingTarget || videos.length === 0 || restoredScrollRef.current) {
      return
    }

    const savedIndex = activeIndexByTab[feedTab] ?? 0
    const index = Math.min(Math.max(0, savedIndex), videos.length - 1)
    if (index > 0) {
      scrollToIndex(index, 'auto')
      setActiveIndex(index)
    }
    restoredScrollRef.current = true
  }, [
    targetVideoId,
    awaitingTarget,
    videos.length,
    feedTab,
    activeIndexByTab,
    scrollToIndex,
    setActiveIndex,
  ])

  const handleTabChange = useCallback(
    (tab: ReelsFeedTab) => {
      pauseAllPageVideos()
      setFeedTab(tab)
      hasScrolledToTargetRef.current = false
      restoredScrollRef.current = false
    },
    [setFeedTab]
  )

  useEffect(() => {
    return () => {
      pauseAllPageVideos()
    }
  }, [])

  useEffect(() => {
    if (pathname !== ROUTES.REELS) {
      pauseAllPageVideos()
    }
  }, [pathname])

  const showFollowingLoginPrompt = feedTab === 'following' && !authLoading && !user
  const showFollowingEmpty = feedTab === 'following' && user && !loading && !awaitingTarget && videos.length === 0 && !error

  useEffect(() => {
    if (loading || awaitingTarget || videos.length === 0) return
    if (activeIndex >= videos.length - 2 && hasMore && !loadingMore) {
      loadMore()
    }
  }, [activeIndex, videos.length, hasMore, loadingMore, loadMore, loading, awaitingTarget])

  const playbackEnabled = !targetVideoId || !resolvingTarget
  const showVideoFeed =
    !loading &&
    !awaitingTarget &&
    !error &&
    !showFollowingLoginPrompt &&
    !showFollowingEmpty &&
    videos.length > 0

  return (
    <ReelsAudioProvider>
    <div className={cn('reels-page', showVideoFeed && 'reels-layout')}>
      <div className={cn('reels-feed w-full', showVideoFeed && 'reels-player-wrap')}>
        {/* Immersive header: tabs only, no title/icon */}
        <header className="reels-header bg-black/0 backdrop-blur-none">
          <ReelsFeedTabs active={feedTab} onChange={handleTabChange} />
        </header>

        {loading || awaitingTarget ? (
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
      ) : showFollowingLoginPrompt ? (
        <ReelsStatePanel>
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Takip akışı</p>
          <p className="text-sm text-[rgb(var(--color-muted))]">
            Takip ettiğiniz hesapların videolarını görmek için giriş yapın.
          </p>
          <Link
            href={ROUTES.LOGIN}
            className="mt-2 inline-flex items-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Giriş yap
          </Link>
        </ReelsStatePanel>
      ) : showFollowingEmpty ? (
        <ReelsStatePanel>
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Takip akışı boş</p>
          <p className="text-sm text-[rgb(var(--color-muted))]">
            Takip ettiğiniz hesaplardan henüz video yok. Yeni içerikler burada görünecek.
          </p>
        </ReelsStatePanel>
      ) : videos.length === 0 ? (
        <ReelsStatePanel>
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Video bulunamadı</p>
          <p className="text-sm text-[rgb(var(--color-muted))]">
            Henüz yayınlanmış video yok. İlk videoyu paylaşarak akışı başlat!
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
          {videos.map((video, index) => {
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
          videos={videos}
          activeIndex={activeIndex}
          onSelect={(index) => scrollToIndex(index)}
        />
      )}
    </div>
    </ReelsAudioProvider>
  )
}
