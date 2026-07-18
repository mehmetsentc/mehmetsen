'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { auth } from '@/lib/firebase/auth'
import { getConsent, onConsentChange } from '@/lib/consent'

const VISITOR_KEY = 'nahaber-analytics-visitor'
const SESSION_KEY = 'nahaber-analytics-session'
const CAMPAIGN_KEY = 'nahaber-analytics-campaign'

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function storedId(storage: Storage, key: string): string {
  try {
    const existing = storage.getItem(key)
    if (existing) return existing
    const id = randomId()
    storage.setItem(key, id)
    return id
  } catch {
    return randomId()
  }
}

function campaignData(): Record<string, string> {
  try {
    const params = new URLSearchParams(window.location.search)
    const incoming = {
      utmSource: params.get('utm_source')?.slice(0, 100) || '',
      utmMedium: params.get('utm_medium')?.slice(0, 100) || '',
      utmCampaign: params.get('utm_campaign')?.slice(0, 150) || '',
    }
    if (incoming.utmSource || incoming.utmMedium || incoming.utmCampaign) {
      sessionStorage.setItem(CAMPAIGN_KEY, JSON.stringify(incoming))
      return incoming
    }
    return JSON.parse(sessionStorage.getItem(CAMPAIGN_KEY) || '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/**
 * Fires a pageview event to /api/analytics/track on every route change.
 * Pass postId when on an article page to also increment the article's viewsCount.
 */
export function useTrackPageview(postId?: string) {
  const pathname = usePathname()
  const lastTracked = useRef<string>('')
  const [consentRevision, setConsentRevision] = useState(0)

  useEffect(() => {
    return onConsentChange(() => {
      lastTracked.current = ''
      setConsentRevision((value) => value + 1)
    })
  }, [])

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin') || pathname.startsWith('/api')) return
    if (!getConsent()?.categories.analytics) return

    const resolvedPostId =
      postId ||
      document.querySelector<HTMLElement>('[data-article-id]')?.dataset.articleId ||
      undefined
    const key = `${pathname}__${resolvedPostId ?? ''}`
    if (lastTracked.current === key) return
    lastTracked.current = key

    const eventId = randomId()
    const startedAt = Date.now()
    const visitorId = storedId(localStorage, VISITOR_KEY)
    const sessionId = storedId(sessionStorage, SESSION_KEY)
    const campaign = campaignData()
    const basePayload = {
      eventId,
      visitorId,
      sessionId,
      path: pathname,
      referrer: document.referrer,
      postId: resolvedPostId,
      analyticsConsent: true,
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      screen: `${window.screen.width}x${window.screen.height}`,
      ...campaign,
    }

    const send = async (payload: Record<string, unknown>, preferBeacon = false) => {
      const serialized = JSON.stringify(payload)
      const token = await auth.currentUser?.getIdToken().catch(() => undefined)
      if (preferBeacon && !token && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([serialized], { type: 'application/json' })
        if (navigator.sendBeacon('/api/analytics/track', blob)) return
      }
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: serialized,
        keepalive: true,
      }).catch(() => {})
    }

    void send({ ...basePayload, event: 'pageview' })

    return () => {
      const root = document.documentElement
      const scrollable = Math.max(1, root.scrollHeight - window.innerHeight)
      const scrollDepth = Math.min(100, Math.round((window.scrollY / scrollable) * 100))
      void send({
        event: 'engagement',
        eventId,
        sessionId,
        analyticsConsent: true,
        durationMs: Math.min(Date.now() - startedAt, 30 * 60 * 1000),
        scrollDepth,
      }, true)
    }
  }, [pathname, postId, consentRevision])
}
