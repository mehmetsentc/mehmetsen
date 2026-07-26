'use client'

import { useEffect, useRef, useState } from 'react'
import type { HomeFeedInitialData } from '@/types/newsItem'
import {
  FEED_LIVE_DEFER_MS,
  FEED_LIVE_POLL_MS,
  notifyFeedUpdated,
} from '@/lib/feedLiveToast'

function feedFingerprint(data: HomeFeedInitialData): string {
  const featured = data.featured.map((i) => i.id).join(',')
  const latest = data.latest.slice(0, 8).map((i) => i.id).join(',')
  const breaking = data.breaking.slice(0, 6).map((i) => i.id).join(',')
  return `${featured}|${latest}|${breaking}`
}

function countNewIds(prev: HomeFeedInitialData, next: HomeFeedInitialData): number {
  const seen = new Set<string>()
  for (const item of [...prev.latest, ...prev.breaking, ...prev.featured]) {
    seen.add(item.id)
  }
  let n = 0
  for (const item of [...next.latest, ...next.breaking, ...next.featured]) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      n++
    }
  }
  return n
}

/**
 * Ana sayfa (/feed) — açıkken /api/feed/home poll eder.
 * Yeni haber / Öne Çıkan değişince veriyi otomatik yeniler (tam sayfa reload yok).
 */
export function useHomeFeedLiveUpdates(initial: HomeFeedInitialData): HomeFeedInitialData {
  const [data, setData] = useState(initial)
  const liveReadyRef = useRef(false)
  const fingerprintRef = useRef(feedFingerprint(initial))
  const dataRef = useRef(initial)
  const initialKey = `${initial.latest[0]?.id ?? ''}:${initial.featured[0]?.id ?? ''}:${initial.latest.length}`

  useEffect(() => {
    setData(initial)
    dataRef.current = initial
    fingerprintRef.current = feedFingerprint(initial)
    liveReadyRef.current = false
  }, [initialKey, initial])

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let deferTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const runPoll = () => {
      void fetch('/api/feed/home', { cache: 'no-store' })
        .then(async (res) => {
          if (!res.ok) throw new Error(`home feed ${res.status}`)
          return res.json() as Promise<HomeFeedInitialData>
        })
        .then((next) => {
          if (cancelled || !Array.isArray(next?.latest)) return
          const fp = feedFingerprint(next)
          if (fp === fingerprintRef.current) {
            liveReadyRef.current = true
            return
          }
          const notify = liveReadyRef.current
          const added = countNewIds(dataRef.current, next)
          fingerprintRef.current = fp
          liveReadyRef.current = true
          dataRef.current = next
          setData(next)
          if (notify && added > 0) notifyFeedUpdated(added)
        })
        .catch((err) => console.warn('[useHomeFeedLiveUpdates] poll failed:', err))
    }

    const startPolling = () => {
      if (pollTimer || cancelled) return
      runPoll()
      pollTimer = setInterval(runPoll, FEED_LIVE_POLL_MS)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
      } else if (!cancelled) {
        runPoll()
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    const startAfterInteraction = () => {
      if (cancelled) return
      startPolling()
      window.removeEventListener('pointerdown', startAfterInteraction)
      window.removeEventListener('keydown', startAfterInteraction)
      window.removeEventListener('scroll', startAfterInteraction)
    }

    deferTimer = setTimeout(() => {
      if (cancelled) return
      startPolling()
      window.removeEventListener('pointerdown', startAfterInteraction)
      window.removeEventListener('keydown', startAfterInteraction)
      window.removeEventListener('scroll', startAfterInteraction)
    }, FEED_LIVE_DEFER_MS)

    window.addEventListener('pointerdown', startAfterInteraction, { once: true, passive: true })
    window.addEventListener('keydown', startAfterInteraction, { once: true })
    window.addEventListener('scroll', startAfterInteraction, { once: true, passive: true })

    return () => {
      cancelled = true
      liveReadyRef.current = false
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pointerdown', startAfterInteraction)
      window.removeEventListener('keydown', startAfterInteraction)
      window.removeEventListener('scroll', startAfterInteraction)
      if (deferTimer) clearTimeout(deferTimer)
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [initialKey])

  return data
}
