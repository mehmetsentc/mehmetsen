'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { VideoFeedItem } from '@/components/video/VideoFeedItem'
import { useActiveSnapItem } from '@/hooks/useInfiniteScroll'
import { nativePreloadRoleFor } from '@/lib/videoFeed/nativePreloadPolicy'
import {
  buildV1C2AAdminValidationItems,
  v1c2aAdminValidationNoopUpdate,
} from '@/lib/videoFeed/v1c2aAdminValidation'
import { pauseAllPageVideos } from '@/lib/videoPlayback'
import { ReelsAudioProvider, useReelsAudio } from '@/store/reelsAudioContext'

const ITEMS = buildV1C2AAdminValidationItems()

function MuteControl() {
  const { effectiveMuted, toggleMuted } = useReelsAudio()
  return (
    <button
      type="button"
      onClick={toggleMuted}
      className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white"
      aria-label={effectiveMuted ? 'Unmute' : 'Mute'}
    >
      {effectiveMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      {effectiveMuted ? 'Muted' : 'Sound on'}
    </button>
  )
}

function ValidationDeck() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [healthSha, setHealthSha] = useState<string | null>(null)
  const { containerRef, setItemRef } = useActiveSnapItem({
    onActiveChange: setActiveIndex,
    itemCount: ITEMS.length,
  })

  useEffect(() => {
    let cancelled = false
    void fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { version?: string } | null) => {
        if (!cancelled && typeof body?.version === 'string' && body.version) {
          setHealthSha(body.version)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      pauseAllPageVideos()
    }
  }, [])

  const handleUpdate = useCallback(() => {
    v1c2aAdminValidationNoopUpdate()
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-black text-white">
      <div className="shrink-0 space-y-2 px-4 py-3">
        <h1 className="text-base font-bold">V1C.2A Native Playback Validation</h1>
        <p className="rounded-md bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-100">
          Admin validation only — no analytics writes
        </p>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/70">
          {healthSha ? <span>SHA {healthSha}</span> : null}
          <span>
            Slide {activeIndex + 1}/{ITEMS.length}
          </span>
          <MuteControl />
        </div>
      </div>

      <div
        className="min-h-0 flex-1"
        style={
          {
            '--reels-viewport-h': 'min(68dvh, 720px)',
            '--reels-video-w': 'min(100%, 360px)',
          } as CSSProperties
        }
      >
        <div
          ref={containerRef}
          className="reels-scroll-container"
          style={{ scrollSnapType: 'y mandatory' }}
        >
          {ITEMS.map((video, index) => {
            const windowStart = Math.max(0, activeIndex - 1)
            const windowEnd = activeIndex + 3
            const inWindow = index >= windowStart && index <= windowEnd
            return (
              <VideoFeedItem
                key={video.id}
                video={video}
                index={index}
                isActive={index === activeIndex}
                isNext={index === activeIndex + 1}
                mediaRole={nativePreloadRoleFor(index, activeIndex)}
                swipeGeneration={activeIndex}
                setItemRef={setItemRef}
                onUpdate={handleUpdate}
                virtualized={!inWindow}
                surface="video"
                isolateFromAnalytics
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function V1C2ANativeValidationClient() {
  return (
    <div className="dark flex h-full min-h-0 flex-col bg-black" style={{ colorScheme: 'dark' }}>
      <ReelsAudioProvider>
        <ValidationDeck />
      </ReelsAudioProvider>
    </div>
  )
}
