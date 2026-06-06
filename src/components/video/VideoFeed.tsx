'use client'

import { useCallback, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useVideoFeed } from '@/hooks/useVideoFeed'
import { useInfiniteScroll, useActiveSnapItem } from '@/hooks/useInfiniteScroll'
import { VideoFeedItem } from './VideoFeedItem'
import { VideoFeedNav } from './VideoFeedNav'

export function VideoFeed() {
  const {
    videos,
    loading,
    loadingMore,
    hasMore,
    activeIndex,
    setActiveIndex,
    loadMore,
    updateVideo,
  } = useVideoFeed()

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    loading: loadingMore,
    rootMargin: '800px',
  })

  const handleActiveChange = useCallback(
    (index: number) => setActiveIndex(index),
    [setActiveIndex]
  )

  const { containerRef, setItemRef } = useActiveSnapItem({
    onActiveChange: handleActiveChange,
    itemCount: videos.length,
  })

  useEffect(() => {
    if (activeIndex >= videos.length - 2 && hasMore && !loadingMore) {
      loadMore()
    }
  }, [activeIndex, videos.length, hasMore, loadingMore, loadMore])

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black">
        <Loader2 className="h-10 w-10 animate-spin text-white" />
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-black px-6 text-center">
        <p className="text-lg font-semibold text-white">Henüz video yok</p>
        <p className="text-sm text-white/60">
          İlk videoyu paylaşarak akışı başlat!
        </p>
      </div>
    )
  }

  return (
    <>
    <div
      ref={containerRef}
      className="video-feed-scroll h-full w-full overflow-y-scroll overscroll-y-contain scroll-smooth bg-black"
      style={{ scrollSnapType: 'y mandatory' }}
    >
      {videos.map((video, index) => (
        <section key={video.id} className="h-full w-full">
          <VideoFeedItem
            video={video}
            index={index}
            isActive={index === activeIndex}
            setItemRef={setItemRef}
            onUpdate={updateVideo}
          />
        </section>
      ))}

      <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />

      {loadingMore && (
        <div className="flex h-20 items-center justify-center bg-black">
          <Loader2 className="h-6 w-6 animate-spin text-white/60" />
        </div>
      )}
    </div>
    <VideoFeedNav />
    </>
  )
}
