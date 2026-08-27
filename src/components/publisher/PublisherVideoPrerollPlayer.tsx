'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  prerollMaxDurationSeconds,
  prerollSessionFrequencyCap,
  prerollSkipAfterSeconds,
} from '@/lib/publisher/selfManagedAdConfig'
import type { PublisherAdViewModel } from '@/components/publisher/PublisherAdRenderer'

const FREQ_KEY = 'nh_preroll_freq'

function getSessionFreq(adId: string): number {
  try {
    const raw = sessionStorage.getItem(FREQ_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    return Number(map[adId] || 0)
  } catch {
    return 0
  }
}

function bumpSessionFreq(adId: string): void {
  try {
    const raw = sessionStorage.getItem(FREQ_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    const keys = Object.keys(map)
    // Bound map size for auth/guest sessions
    if (keys.length > 40) {
      for (const k of keys.slice(0, 10)) delete map[k]
    }
    map[adId] = Number(map[adId] || 0) + 1
    sessionStorage.setItem(FREQ_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/**
 * Video pre-roll: ad → content. Config-driven skip/max duration.
 * On ad load failure → content starts immediately.
 */
export function PublisherVideoPrerollPlayer({
  contentUrl,
  contentPoster,
  contentTitle,
  isEmbed,
  ad,
  enabled,
}: {
  contentUrl: string
  contentPoster?: string | null
  contentTitle: string
  isEmbed: boolean
  ad: PublisherAdViewModel | null
  enabled: boolean
}) {
  const maxDur = prerollMaxDurationSeconds()
  const skipAfter = prerollSkipAfterSeconds()
  const cap = prerollSessionFrequencyCap()

  const shouldShowAd =
    enabled &&
    !!ad &&
    !!ad.mediaUrl &&
    getSessionFreq(ad.adId) < cap

  const [phase, setPhase] = useState<'ad' | 'content'>(shouldShowAd ? 'ad' : 'content')
  const [elapsed, setElapsed] = useState(0)
  const [canSkip, setCanSkip] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const counted = useRef(false)

  useEffect(() => {
    if (phase !== 'ad' || !ad) return
    if (!counted.current) {
      counted.current = true
      bumpSessionFreq(ad.adId)
    }
  }, [phase, ad])

  useEffect(() => {
    if (phase !== 'ad') return
    const t = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1
        if (next >= skipAfter) setCanSkip(true)
        if (next >= maxDur) setPhase('content')
        return next
      })
    }, 1000)
    return () => clearInterval(t)
  }, [phase, skipAfter, maxDur])

  const onAdError = useCallback(() => {
    setPhase('content')
  }, [])

  const onAdEnded = useCallback(() => {
    setPhase('content')
  }, [])

  if (phase === 'ad' && ad) {
    return (
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-black" data-preroll="playing">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={ad.mediaUrl}
          poster={ad.thumbnailUrl ?? undefined}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-contain"
          onError={onAdError}
          onEnded={onAdEnded}
        />
        <div className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Reklam
        </div>
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {ad.clickHref ? (
            <Link
              href={ad.clickHref}
              className="rounded bg-white/90 px-2 py-1 text-[11px] font-bold text-black"
              rel="sponsored noopener noreferrer"
              target="_blank"
            >
              Detay
            </Link>
          ) : null}
          {canSkip ? (
            <button
              type="button"
              className="rounded bg-black/70 px-2 py-1 text-[11px] font-bold text-white"
              onClick={() => setPhase('content')}
            >
              Atla
            </button>
          ) : (
            <span className="rounded bg-black/50 px-2 py-1 text-[11px] text-white/80">
              {Math.max(0, skipAfter - elapsed)}s
            </span>
          )}
        </div>
      </div>
    )
  }

  // Content
  if (isEmbed) {
    return (
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-black" data-preroll="content">
        <iframe
          src={
            contentUrl.includes('?')
              ? `${contentUrl}&playsinline=1`
              : `${contentUrl}?rel=0&modestbranding=1&playsinline=1`
          }
          title={contentTitle}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-black" data-preroll="content">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={contentUrl}
        poster={contentPoster ?? undefined}
        controls
        playsInline
        autoPlay={shouldShowAd}
        className="absolute inset-0 h-full w-full object-contain"
      />
    </div>
  )
}
