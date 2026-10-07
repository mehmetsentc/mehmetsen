'use client'

/**
 * Feed 2 — full-screen ad shown when a story opens (see readerInterstitialPolicy.ts).
 * Sits above the reader (reader z-[170]); the close (X / "Reklamı geç") appears after
 * 5 seconds. Image and video creatives only — HTML creatives are never rendered here.
 */
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { AdBannerPublic } from '@/types/adBanner'
import type { FeedItemDto } from '@/types/smartFeed'
import { resolveAdImageUrl } from '@/lib/adBannerUtils'
import { useAdDisplayTheme } from '@/hooks/useAdDisplayTheme'
import { isFeedReaderInterstitialEnabledClient } from '@/lib/feed/featureFlagClient'
import {
  READER_INTERSTITIAL_POLICY,
  READER_INTERSTITIAL_SLOT_ID,
  loadInterstitialState,
  recordOpen,
  recordShown,
  saveInterstitialState,
  shouldOfferInterstitial,
} from '@/lib/feed/readerInterstitialPolicy'

/** Short in-memory cache so a slot without ads does not refetch on every story. */
const adCache = new Map<string, { at: number; ad: AdBannerPublic | null }>()
const AD_CACHE_MS = 60_000

async function fetchInterstitialAd(citySlug: string | null | undefined): Promise<AdBannerPublic | null> {
  const key = citySlug || '_'
  const hit = adCache.get(key)
  if (hit && Date.now() - hit.at < AD_CACHE_MS) return hit.ad
  const ad = await fetchInterstitialAdUncached(citySlug)
  adCache.set(key, { at: Date.now(), ad })
  return ad
}

async function fetchInterstitialAdUncached(citySlug: string | null | undefined): Promise<AdBannerPublic | null> {
  const qs = new URLSearchParams({ slots: READER_INTERSTITIAL_SLOT_ID })
  if (citySlug) qs.set('citySlug', citySlug)
  try {
    const res = await fetch(`/api/ads?${qs}`)
    if (!res.ok) return null
    const json = (await res.json()) as { ads?: Record<string, AdBannerPublic | null> }
    const ad = json.ads?.[READER_INTERSTITIAL_SLOT_ID] ?? null
    if (!ad || ad.format === 'html') return null
    return ad
  } catch {
    return null
  }
}

/**
 * Decide once per committed reader open (keyed by `generation`). Counts the open,
 * asks the policy, and only marks the ad as "shown" when a creative actually exists.
 */
export function useReaderInterstitial(session: { item: FeedItemDto; committed: boolean; generation: number } | null) {
  const [ad, setAd] = useState<AdBannerPublic | null>(null)
  const handled = useRef<number | null>(null)

  useEffect(() => {
    if (!session?.committed || handled.current === session.generation) return
    handled.current = session.generation
    if (!isFeedReaderInterstitialEnabledClient()) return
    let state = recordOpen(loadInterstitialState())
    saveInterstitialState(state)
    if (!shouldOfferInterstitial(state, Date.now())) return
    let cancelled = false
    void fetchInterstitialAd(session.item.citySlug ?? null).then((found) => {
      if (cancelled || !found) return
      state = recordShown(loadInterstitialState(), Date.now())
      saveInterstitialState(state)
      setAd(found)
    })
    return () => {
      cancelled = true
    }
  }, [session?.committed, session?.generation, session?.item.citySlug])

  // Reader closed → drop any ad still on screen.
  useEffect(() => {
    if (!session) setAd(null)
  }, [session])

  return { ad, close: () => setAd(null) }
}

export function FeedReaderInterstitial({ ad, onClose }: { ad: AdBannerPublic; onClose: () => void }) {
  const theme = useAdDisplayTheme()
  const [left, setLeft] = useState<number>(READER_INTERSTITIAL_POLICY.closeAfterSeconds)

  useEffect(() => {
    if (left <= 0) return
    const t = window.setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [left])

  const image = ad.format === 'image' ? resolveAdImageUrl(ad, theme) : null
  const media =
    ad.format === 'video' && ad.videoUrl ? (
      <video src={ad.videoUrl} autoPlay muted loop playsInline className="max-h-full max-w-full object-contain" />
    ) : image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt={ad.altText ?? 'Reklam'} className="max-h-full max-w-full object-contain" />
    ) : null
  if (!media) return null

  return (
    <div className="fixed inset-0 z-[190] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label="Reklam">
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+12px)] text-white">
        <span className="rounded bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Reklam</span>
        {left > 0 ? (
          <span className="text-sm text-white/80" aria-live="polite">
            {left} sn sonra kapatabilirsiniz
          </span>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25"
            aria-label="Reklamı kapat"
          >
            Reklamı geç <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {ad.clickUrl ? (
          <a href={ad.clickUrl} target="_blank" rel="noopener noreferrer sponsored" className="flex max-h-full max-w-full items-center justify-center">
            {media}
          </a>
        ) : (
          media
        )}
      </div>
    </div>
  )
}
