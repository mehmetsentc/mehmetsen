'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  impressionDwellMs,
  impressionVisibleRatio,
} from '@/lib/publisher/selfManagedAdConfig'
import type { PublisherAdCreativeType } from '@/types/publisherManagedAds'

export type PublisherAdViewModel = {
  adId: string
  creativeId: string
  creativeType: PublisherAdCreativeType
  mediaUrl: string
  thumbnailUrl?: string | null
  headline?: string | null
  body?: string | null
  altText?: string | null
  advertiserName?: string | null
  clickHref: string
  label?: 'Reklam' | 'Sponsorlu'
}

function fireImpression(payload: {
  adId: string
  creativeId: string
  sessionId: string
}) {
  const dedupeKey = `imp:${payload.adId}:${payload.sessionId}:${new Date().toISOString().slice(0, 13)}`
  void fetch('/api/ads/impression', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      adId: payload.adId,
      creativeId: payload.creativeId,
      sessionId: payload.sessionId,
      dedupeKey,
      referrerType: 'page',
      deviceClass: typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop',
    }),
    keepalive: true,
  }).catch(() => {})
}

function getSessionId(): string {
  try {
    const key = 'nh_ad_sid'
    let sid = sessionStorage.getItem(key)
    if (!sid) {
      sid = `s_${Math.random().toString(36).slice(2)}_${Date.now()}`
      sessionStorage.setItem(key, sid)
    }
    return sid
  } catch {
    return `s_anon_${Date.now()}`
  }
}

/** Sponsored creative renderer — IMAGE_BANNER / VIDEO / NATIVE_CARD. */
export function PublisherAdRenderer({
  ad,
  className,
  label = 'Reklam',
}: {
  ad: PublisherAdViewModel
  className?: string
  label?: 'Reklam' | 'Sponsorlu'
}) {
  const rootRef = useRef<HTMLElement>(null)
  const fired = useRef(false)

  useEffect(() => {
    const el = rootRef.current
    if (!el || fired.current) return
    const ratio = impressionVisibleRatio()
    const dwell = impressionDwellMs()
    let timer: ReturnType<typeof setTimeout> | null = null
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        if (entry.isIntersecting && entry.intersectionRatio >= ratio) {
          if (!timer) {
            timer = setTimeout(() => {
              if (fired.current) return
              fired.current = true
              fireImpression({
                adId: ad.adId,
                creativeId: ad.creativeId,
                sessionId: getSessionId(),
              })
            }, dwell)
          }
        } else if (timer) {
          clearTimeout(timer)
          timer = null
        }
      },
      { threshold: [0, ratio, 1] }
    )
    obs.observe(el)
    return () => {
      obs.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [ad.adId, ad.creativeId])

  const sponsored = (
    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--color-muted))]">
      {label}
    </span>
  )

  if (ad.creativeType === 'NATIVE_CARD' || ad.creativeType === 'SPONSORED_CARD') {
    return (
      <aside
        ref={rootRef}
        className={cn('overflow-hidden rounded-xl border border-[rgb(var(--color-border))]', className)}
        data-ad-slot="self-managed"
        data-ad-id={ad.adId}
        aria-label="Sponsorlu içerik"
      >
        <Link href={ad.clickHref} className="block" rel="sponsored noopener noreferrer" target="_blank">
          <div className="relative aspect-[16/9] bg-[rgb(var(--color-bg))]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ad.mediaUrl}
              alt={ad.altText || ad.headline || 'Reklam'}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="space-y-1 p-3">
            {sponsored}
            {ad.headline ? (
              <p className="text-sm font-bold text-[rgb(var(--color-text))]">{ad.headline}</p>
            ) : null}
            {ad.body ? (
              <p className="text-xs text-[rgb(var(--color-muted))] line-clamp-2">{ad.body}</p>
            ) : null}
            {ad.advertiserName ? (
              <p className="text-[11px] text-[rgb(var(--color-muted))]">{ad.advertiserName}</p>
            ) : null}
          </div>
        </Link>
      </aside>
    )
  }

  if (ad.creativeType === 'VIDEO') {
    return (
      <aside
        ref={rootRef}
        className={cn('overflow-hidden rounded-xl border border-[rgb(var(--color-border))]', className)}
        data-ad-slot="self-managed"
        data-ad-id={ad.adId}
        aria-label="Video reklam"
      >
        <div className="relative aspect-[16/9] bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={ad.mediaUrl}
            poster={ad.thumbnailUrl ?? undefined}
            controls
            playsInline
            className="h-full w-full object-contain"
          />
          <div className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5">{sponsored}</div>
        </div>
        <div className="p-2">
          <Link
            href={ad.clickHref}
            className="text-xs font-bold text-[rgb(var(--color-brand))] hover:underline"
            rel="sponsored noopener noreferrer"
            target="_blank"
          >
            {ad.headline || 'Detaylı bilgi'}
          </Link>
        </div>
      </aside>
    )
  }

  // IMAGE_BANNER default
  return (
    <aside
      ref={rootRef}
      className={cn('overflow-hidden rounded-xl border border-[rgb(var(--color-border))]', className)}
      data-ad-slot="self-managed"
      data-ad-id={ad.adId}
      aria-label="Reklam"
    >
      <Link href={ad.clickHref} className="block" rel="sponsored noopener noreferrer" target="_blank">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ad.mediaUrl}
            alt={ad.altText || 'Reklam'}
            className="w-full object-cover"
          />
          <div className="absolute left-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-white">
            {sponsored}
          </div>
        </div>
      </Link>
    </aside>
  )
}
