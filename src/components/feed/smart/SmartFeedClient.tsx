'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Inbox, CheckCircle2, RefreshCw, AlertCircle, ShieldAlert, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { FullscreenNewsCard } from '@/components/feed/smart/FullscreenNewsCard'
import { FullscreenNewsCardSkeleton } from '@/components/feed/smart/FullscreenNewsCardSkeleton'
import { FeedV2CategoryNav } from '@/components/feed/smart/FeedV2CategoryNav'
import { FeedCardMenu } from '@/components/feed/smart/FeedCardMenu'
import { CommentsBottomSheet } from '@/components/feed/smart/CommentsBottomSheet'
import {
  FeedArticleReader,
  type FeedReaderTelemetryPayload,
} from '@/components/feed/smart/FeedArticleReader'
import {
  dispatchFeedOpenGesture,
  shouldIgnoreFeedOpenGestureTarget,
} from '@/lib/feed/reader/feedOpenGesture'
import { LocalLocationSetupSheet, type LocalCityOption } from '@/components/local/LocalLocationSetupSheet'
import { FEED_PAGINATION } from '@/lib/feed/config'
import {
  getOrCreateFeedSessionId,
  readGuestSeen,
  writeGuestSeen,
  useFeedImpressionRef,
} from '@/lib/feed/feedSeenClient'
import { feedItemIdentityKeys, feedItemsOverlap } from '@/lib/feed/feedIdentity'
import { clearFeedRestore, consumePendingFeedRestore, readFeedRestore, saveFeedRestore } from '@/lib/feed/feedRestoration'
import { isSocialGraphEnabledClient } from '@/lib/social/featureFlagClient'
import { socialApi } from '@/lib/social/clientApi'
import { buildAuthIntent, loginHrefWithIntent } from '@/lib/social/authIntent'
import { getClientAuthToken, ensureAuthReady, auth } from '@/lib/firebase/auth'
import {
  fetchFeedReaderCapability,
  isCapabilityGenerationCurrent,
} from '@/lib/feed/reader/capabilityClient'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { useUserLocation } from '@/hooks/useUserLocation'
import { getCityCategoryName, nearestProvinceSlug } from '@/constants/cities'
import { getCurrentPosition } from '@/lib/location'
import {
  readLocalNewsCitySlug,
  writeLocalNewsCitySlug,
  clearLocalNewsCitySlug,
  writeStoredUserLocation,
} from '@/lib/userLocationStorage'
import {
  fetchAccountLocalLocation,
  persistAccountLocalLocation,
  readLocalClearedSentinel,
  writeLocalClearedSentinel,
} from '@/lib/feed/accountLocalLocation'
import { ROUTES } from '@/constants/routes'
import { parseFeedV2TabFromSearch, type FeedV2Tab } from '@/lib/feed/feedV2Tabs'
import { cn } from '@/lib/utils'
import type { FeedItemDto, FeedMode, FeedPageDto } from '@/types/smartFeed'

/** Keep a sliding DOM window; spacers preserve global scroll indices. */
const WINDOW_MAX = 25
const WINDOW_BEFORE = 5
/** Guest filter may empty a page — keep fetching while server hasMore. */
const EMPTY_PAGE_REFILL_MAX = 8

function parseMode(raw: string | null): FeedMode {
  const m = (raw ?? 'personal').trim().toLowerCase()
  if (m === 'following' || m === 'breaking' || m === 'local' || m === 'personal') return m
  return 'personal'
}

type FeedErrorState =
  | { type: 'AUTH_REQUIRED'; message: string }
  | { type: 'DISABLED'; reason?: string; message: string }
  | { type: 'NETWORK_ERROR'; message: string }
  | null

interface SocialItemState {
  liked: boolean
  saved: boolean
  likeCount: number
  commentCount: number
  saveCount: number
  reaction?: string | null
}

async function fetchFeedPage(opts: {
  mode: FeedMode
  category?: string | null
  cursor?: string | null
  city?: string | null
  district?: string | null
  refresh?: boolean
  signal?: AbortSignal
  forceAuthRefresh?: boolean
}): Promise<FeedPageDto> {
  const params = new URLSearchParams()
  if (opts.mode !== 'personal') params.set('mode', opts.mode)
  if (opts.category) params.set('category', opts.category)
  if (opts.cursor) params.set('cursor', opts.cursor)
  if (opts.refresh) params.set('refresh', '1')
  params.set('limit', String(FEED_PAGINATION.defaultLimit))
  if (opts.city) params.set('city', opts.city)
  if (opts.district) params.set('district', opts.district)

  const headers: Record<string, string> = {
    'x-feed-session': getOrCreateFeedSessionId(),
  }
  const token = await getClientAuthToken(opts.forceAuthRefresh)
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`/api/feed/v2?${params}`, {
    headers,
    credentials: 'include',
    signal: opts.signal,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      reason?: string
      authStatus?: string
      userId?: string | null
    }
    const err = new Error(body.error ?? 'feed_fetch_failed') as Error & {
      status?: number
      reason?: string
      authStatus?: string
      userId?: string | null
    }
    err.status = res.status
    err.reason = body.reason
    err.authStatus = body.authStatus
    err.userId = body.userId
    throw err
  }
  return res.json() as Promise<FeedPageDto>
}

async function postTelemetry(payload: {
  events?: Array<{
    eventType: string
    articleId?: string
    clusterId?: string | null
    feedType?: string
    dwellMs?: number
    metadata?: Record<string, unknown>
  }>
  impressions?: Array<{ articleId: string; clusterId?: string | null; publisherId?: string | null; feedType?: string }>
}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-feed-session': getOrCreateFeedSessionId(),
  }
  const token = await getClientAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`
  await fetch('/api/feed/telemetry', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {})
}

interface SmartFeedClientProps {
  initialCitySlug?: string | null
  initialDistrictSlug?: string | null
  /** SSR-prefetched first page — paints cards before auth/profile finishes. */
  initialPage?: FeedPageDto | null
  debug?: boolean
}

export function SmartFeedClient({
  initialCitySlug,
  initialDistrictSlug,
  initialPage = null,
  debug,
}: SmartFeedClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user: authUser, loading: authLoading } = useAuthContext()
  const userLocation = useUserLocation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeIndexRef = useRef(0)
  const dwellStartRef = useRef<number | null>(null)
  const generationIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const loadingMoreRef = useRef(false)
  const lastPrefetchCursorRef = useRef<string | null>(null)
  const personalizedOnceRef = useRef(false)

  const [mode, setMode] = useState<FeedMode>(() => {
    if (typeof window !== 'undefined') {
      const restore = readFeedRestore()
      if (restore?.pending && restore.mode) return restore.mode
    }
    return parseFeedV2TabFromSearch({
      mode: searchParams.get('mode'),
      category: searchParams.get('category'),
    }).mode
  })
  const [category, setCategory] = useState<string | null>(() =>
    parseFeedV2TabFromSearch({
      mode: searchParams.get('mode'),
      category: searchParams.get('category'),
    }).category
  )
  const [activeTabId, setActiveTabId] = useState(() =>
    parseFeedV2TabFromSearch({
      mode: searchParams.get('mode'),
      category: searchParams.get('category'),
    }).tabId
  )
  const [localCitySlug, setLocalCitySlug] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return readLocalNewsCitySlug() || initialCitySlug || null
    }
    return initialCitySlug ?? null
  })
  const [localCityName, setLocalCityName] = useState<string | null>(() => {
    const slug =
      typeof window !== 'undefined'
        ? readLocalNewsCitySlug() || initialCitySlug || null
        : initialCitySlug ?? null
    return slug ? getCityCategoryName(slug) : null
  })
  const [locationSetupOpen, setLocationSetupOpen] = useState(false)
  const [requestingGps, setRequestingGps] = useState(false)
  const [gpsDenied, setGpsDenied] = useState(false)
  const localCitySlugRef = useRef<string | null>(localCitySlug)
  localCitySlugRef.current = localCitySlug

  const [items, setItems] = useState<FeedItemDto[]>(() => initialPage?.items ?? [])
  const itemsRef = useRef<FeedItemDto[]>([])
  itemsRef.current = items
  const [cursor, setCursor] = useState<string | null>(() => initialPage?.nextCursor ?? null)
  const [hasMore, setHasMore] = useState(() => initialPage?.hasMore ?? true)
  const [loading, setLoading] = useState(() => !(initialPage?.items && initialPage.items.length > 0))
  const [loadingMore, setLoadingMore] = useState(false)
  const [errorState, setErrorState] = useState<FeedErrorState>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [commentArticleId, setCommentArticleId] = useState<string | null>(null)
  const [readerItem, setReaderItem] = useState<{ item: FeedItemDto; index: number } | null>(null)
  const [feedReaderEnabled, setFeedReaderEnabled] = useState(false)
  const [readerCapabilityReady, setReaderCapabilityReady] = useState(false)
  const [feedScrollLocked, setFeedScrollLocked] = useState(false)
  const [social, setSocial] = useState<Record<string, SocialItemState>>({})
  const [actionLoading, setActionLoading] = useState<Record<string, 'like' | 'save'>>({})
  const restoreAppliedRef = useRef(false)
  const pendingRestoreScrollRef = useRef<number | null>(null)
  const cardHeightRef = useRef(0)
  const programmaticScrollRef = useRef(false)
  const [cardHeightPx, setCardHeightPx] = useState(0)
  const feedReaderEnabledRef = useRef(false)
  const readerCapabilityReadyRef = useRef(false)
  const readerCapabilityGenerationRef = useRef(0)
  const readerCapabilityAbortRef = useRef<AbortController | null>(null)

  const isDebug = Boolean(debug || searchParams.get('debug') === '1')
  const socialEnabled = isSocialGraphEnabledClient()
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const applyFeedReaderCapability = useCallback((enabled: boolean) => {
    feedReaderEnabledRef.current = enabled
    setFeedReaderEnabled(enabled)
    readerCapabilityReadyRef.current = true
    setReaderCapabilityReady(true)
  }, [])

  /**
   * Wait for AuthProvider (incl. deferred /feed-v2 bootstrap) before settling capability.
   * Unauthenticated `enabled=false` must not stick across later Firebase hydration.
   */
  useEffect(() => {
    if (authLoading) {
      readerCapabilityReadyRef.current = false
      setReaderCapabilityReady(false)
      return
    }

    readerCapabilityAbortRef.current?.abort()
    const ac = new AbortController()
    readerCapabilityAbortRef.current = ac
    const generation = ++readerCapabilityGenerationRef.current

    ;(async () => {
      try {
        let result = await fetchFeedReaderCapability({ signal: ac.signal })
        // AuthProvider may already have uid while ID token is momentarily unavailable.
        if (!ac.signal.aborted && authUser?.uid && !result.authenticated) {
          result = await fetchFeedReaderCapability({
            signal: ac.signal,
            forceAuthRefresh: true,
          })
        }
        if (ac.signal.aborted) return
        if (!isCapabilityGenerationCurrent(generation, readerCapabilityGenerationRef.current)) return
        applyFeedReaderCapability(result.enabled)
      } catch (err) {
        if (ac.signal.aborted) return
        if (!isCapabilityGenerationCurrent(generation, readerCapabilityGenerationRef.current)) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        applyFeedReaderCapability(false)
      }
    })()

    return () => {
      ac.abort()
    }
  }, [authLoading, authUser?.uid, applyFeedReaderCapability])

  const resolveFeedReaderEnabledForOpen = useCallback(async (): Promise<boolean> => {
    if (readerCapabilityReadyRef.current) return feedReaderEnabledRef.current
    if (authLoading) {
      toast.error('Oturum hazırlanıyor, tekrar deneyin')
      return false
    }
    try {
      let result = await fetchFeedReaderCapability()
      if (authUser?.uid && !result.authenticated) {
        result = await fetchFeedReaderCapability({ forceAuthRefresh: true })
      }
      // Do not clobber a newer effect settle; only fill if still pending.
      if (!readerCapabilityReadyRef.current) {
        applyFeedReaderCapability(result.enabled)
      }
      return feedReaderEnabledRef.current
    } catch {
      if (!readerCapabilityReadyRef.current) {
        applyFeedReaderCapability(false)
      }
      return feedReaderEnabledRef.current
    }
  }, [authLoading, authUser?.uid, applyFeedReaderCapability])

  /** Yerel sekmesi: fallback İstanbul ile ulusal karışım gösterme — gerçek konum şart. */
  const resolveFeedCity = useCallback(
    (activeMode: FeedMode): string | null => {
      if (activeMode === 'local') {
        if (localCitySlugRef.current) return localCitySlugRef.current
        const persisted = readLocalNewsCitySlug()
        if (persisted) return persisted
        if (
          userLocation.ready &&
          userLocation.citySlug &&
          userLocation.source !== 'fallback'
        ) {
          return userLocation.citySlug
        }
        return null
      }
      return (
        localCitySlugRef.current ||
        (userLocation.ready && userLocation.source !== 'fallback' ? userLocation.citySlug : null) ||
        initialCitySlug ||
        null
      )
    },
    [userLocation.ready, userLocation.citySlug, userLocation.source, initialCitySlug]
  )

  const windowStart = Math.max(0, activeIndex - WINDOW_BEFORE)
  const windowEnd = Math.min(items.length, windowStart + WINDOW_MAX)
  const windowItems = items.slice(windowStart, windowEnd)
  const spacerAfter = Math.max(0, items.length - windowEnd)

  const cursorRef = useRef<string | null>(initialPage?.nextCursor ?? null)
  cursorRef.current = cursor
  const hasMoreRef = useRef(Boolean(initialPage?.hasMore ?? true))
  hasMoreRef.current = hasMore

  const loadPage = useCallback(
    async (
      append: boolean,
      nextCursor?: string | null,
      targetMode?: FeedMode,
      forceAuthRefresh = false,
      targetCategory?: string | null
    ) => {
      const activeMode = targetMode ?? mode
      const activeCategory = targetCategory !== undefined ? targetCategory : category

      if (append) {
        if (loadingMoreRef.current) return
        loadingMoreRef.current = true
      } else {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
        abortControllerRef.current = new AbortController()
        generationIdRef.current += 1
        loadingMoreRef.current = false
        lastPrefetchCursorRef.current = null
      }

      const genId = generationIdRef.current
      const signal = !append ? abortControllerRef.current?.signal : undefined

      if (append) setLoadingMore(true)
      else {
        setLoading(true)
        setErrorState(null)
      }

      try {
        let pageCursor = append ? (nextCursor ?? cursorRef.current) : null
        let emptyRefills = 0
        let lastPage: FeedPageDto | null = null
        let acceptedIncoming: FeedItemDto[] = []

        // Keep requesting while guest/local filter empties a thin page but server has more.
        while (emptyRefills <= EMPTY_PAGE_REFILL_MAX) {
          // Deduplicate in-flight append for the same cursor via loadingMoreRef only.
          // Do NOT latch lastPrefetchCursorRef before the fetch — that deadlocks when
          // a request aborts/returns without advancing the cursor (feed stops mid-stream).
          if (append && pageCursor && lastPrefetchCursorRef.current === pageCursor && emptyRefills === 0) {
            // A successful prior fetch already owns this cursor; wait for cursor advance.
            return
          }

          const page = await fetchFeedPage({
            mode: activeMode,
            category: activeCategory,
            cursor: pageCursor,
            city: resolveFeedCity(activeMode),
            district: initialDistrictSlug,
            refresh: !append && emptyRefills === 0,
            signal,
            forceAuthRefresh,
          })

          if (genId !== generationIdRef.current) {
            if (append) lastPrefetchCursorRef.current = null
            return
          }
          lastPage = page
          if (append && pageCursor) {
            lastPrefetchCursorRef.current = pageCursor
          }

          const restorePeek = !append ? readFeedRestore() : null
          const restoreExemptId =
            (!append && (searchParams.get('restore') ?? restorePeek?.articleId)) || null
          // Category tabs: allow re-browse of older stories (server already walks corpus).
          // Personal/following still hide guest-seen to reduce replay.
          const guestSeen =
            !authUser && !activeCategory ? readGuestSeen() : new Set<string>()
          const incoming = page.items.filter((i) => {
            if (restoreExemptId && (i.articleId === restoreExemptId || i.slug === restoreExemptId)) {
              return true
            }
            const keys = feedItemIdentityKeys(i)
            return !keys.some((k) => guestSeen.has(k))
          })

          if (incoming.length > 0 || !page.hasMore || !page.nextCursor) {
            acceptedIncoming = incoming
            break
          }

          emptyRefills += 1
          pageCursor = page.nextCursor
          cursorRef.current = page.nextCursor
          setCursor(page.nextCursor)
          setHasMore(page.hasMore)
          hasMoreRef.current = page.hasMore
        }

        if (genId !== generationIdRef.current || !lastPage) return

        setErrorState(null)
        const base = append ? itemsRef.current : []
        const merged = [...base]
        for (const item of acceptedIncoming) {
          if (merged.some((existing) => feedItemsOverlap(existing, item))) continue
          merged.push(item)
        }
        const added = merged.length - base.length
        itemsRef.current = merged
        setItems(merged)
        setSocial((prev) => {
          const next = { ...prev }
          for (const it of lastPage!.items) {
            if (!next[it.articleId]) {
              next[it.articleId] = {
                liked: it.socialState?.liked ?? false,
                saved: it.socialState?.saved ?? false,
                likeCount: it.socialCounts.likes ?? 0,
                commentCount: it.socialCounts.comments ?? 0,
                saveCount: it.socialCounts.saves ?? 0,
              }
            }
          }
          return next
        })
        setCursor(lastPage.nextCursor)
        cursorRef.current = lastPage.nextCursor

        // Trust backend exhaustion, but don't stall when a page was all-duplicates.
        let nextHasMore = Boolean(lastPage.hasMore && lastPage.nextCursor)
        if (append && added === 0) {
          if (!lastPage.hasMore || !lastPage.nextCursor) {
            nextHasMore = false
          } else {
            // Allow another prefetch with the advanced cursor.
            lastPrefetchCursorRef.current = null
            nextHasMore = true
          }
        }
        setHasMore(nextHasMore)
        hasMoreRef.current = nextHasMore
        if (!append) {
          const restore = readFeedRestore()
          const restoreId = searchParams.get('restore') ?? restore?.articleId
          if (restoreId) {
            let idx = acceptedIncoming.findIndex((i) => i.articleId === restoreId)
            if (idx < 0 && typeof restore?.scrollIndex === 'number') {
              idx = Math.min(restore.scrollIndex, Math.max(0, acceptedIncoming.length - 1))
            }
            if (idx >= 0) {
              setActiveIndex(idx)
              pendingRestoreScrollRef.current = idx
              clearFeedRestore()
            } else {
              setActiveIndex(0)
            }
          } else {
            setActiveIndex(0)
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        if (genId !== generationIdRef.current) return

        console.error('[SmartFeedClient] Error loading feed page:', err)
        const typedErr = err as { status?: number; message?: string; reason?: string }
        const status = typedErr?.status
        const msg = typedErr?.message || 'feed_error'

        if (status === 401 || msg === 'auth_required') {
          setErrorState({
            type: 'AUTH_REQUIRED',
            message: 'Bu akışı görüntülemek için giriş yapmalısınız.',
          })
        } else if (status === 404 || msg === 'Smart feed disabled') {
          setErrorState({
            type: 'DISABLED',
            reason: typedErr?.reason,
            message: 'Akıllı akış şu anda bakımda veya geçici olarak kullanılamıyor.',
          })
        } else {
          setErrorState({
            type: 'NETWORK_ERROR',
            message: 'Haber akışı yüklenirken bir sorun oluştu.',
          })
        }
        await postTelemetry({ events: [{ eventType: 'feed_error', feedType: activeMode }] })
      } finally {
        if (append) {
          loadingMoreRef.current = false
        }
        if (genId === generationIdRef.current) {
          setLoading(false)
          setLoadingMore(false)
        } else if (append) {
          setLoadingMore(false)
        }
      }
    },
    [mode, category, initialDistrictSlug, searchParams, authUser, resolveFeedCity]
  )

  const applyLocalCity = useCallback(
    (slug: string, name: string, source: 'geolocation' | 'manual' | 'ip' | 'profile' | 'cookie') => {
      const normalized = slug.trim().toLowerCase()
      if (!normalized) return
      // IP must never silently become Yerel authority.
      if (source === 'ip') return
      setLocalCitySlug(normalized)
      setLocalCityName(name || getCityCategoryName(normalized))
      localCitySlugRef.current = normalized
      writeLocalNewsCitySlug(normalized)
      writeLocalClearedSentinel(false)
      writeStoredUserLocation({
        citySlug: normalized,
        cityName: name || getCityCategoryName(normalized),
        source,
        updatedAt: Date.now(),
      })
      setLocationSetupOpen(false)
      setGpsDenied(false)
      if (authUser?.uid) {
        void persistAccountLocalLocation({ citySlug: normalized, districtSlug: null })
      }
    },
    [authUser?.uid]
  )

  const clearLocalCity = useCallback(() => {
    setLocalCitySlug(null)
    setLocalCityName(null)
    localCitySlugRef.current = null
    clearLocalNewsCitySlug()
    writeLocalClearedSentinel(true)
    setLocationSetupOpen(true)
    if (authUser?.uid) {
      void persistAccountLocalLocation({ citySlug: null, clear: true })
    }
  }, [authUser?.uid])

  const startAutoLocation = useCallback(async () => {
    setRequestingGps(true)
    setGpsDenied(false)
    try {
      const position = await getCurrentPosition()
      const slug = nearestProvinceSlug(position.coords.latitude, position.coords.longitude)
      applyLocalCity(slug, getCityCategoryName(slug), 'geolocation')
      void loadPage(false, null, 'local', false, null)
    } catch {
      setGpsDenied(true)
    } finally {
      setRequestingGps(false)
    }
  }, [applyLocalCity, loadPage])

  const handleSelectLocalCity = useCallback(
    (city: LocalCityOption) => {
      applyLocalCity(city.slug, city.name, 'manual')
      void loadPage(false, null, 'local', false, null)
    },
    [applyLocalCity, loadPage]
  )

  // Resolve city when Yerel tab is active (account > device; explicit clear wins).
  useEffect(() => {
    if (mode !== 'local') {
      setLocationSetupOpen(false)
      return
    }

    let cancelled = false

    async function hydrate() {
      if (readLocalClearedSentinel()) {
        setLocalCitySlug(null)
        localCitySlugRef.current = null
        setLocationSetupOpen(true)
        return
      }

      if (authUser?.uid) {
        const account = await fetchAccountLocalLocation()
        if (cancelled) return
        if (account?.cleared) {
          writeLocalClearedSentinel(true)
          clearLocalNewsCitySlug()
          setLocalCitySlug(null)
          localCitySlugRef.current = null
          setLocationSetupOpen(true)
          return
        }
        if (account?.citySlug) {
          const slug = account.citySlug
          setLocalCitySlug(slug)
          setLocalCityName(getCityCategoryName(slug))
          localCitySlugRef.current = slug
          writeLocalNewsCitySlug(slug)
          writeLocalClearedSentinel(false)
          setLocationSetupOpen(false)
          return
        }
      }

      const persisted = readLocalNewsCitySlug()
      if (persisted) {
        if (localCitySlug !== persisted) {
          setLocalCitySlug(persisted)
          setLocalCityName(getCityCategoryName(persisted))
          localCitySlugRef.current = persisted
        }
        setLocationSetupOpen(false)
        return
      }

      if (localCitySlug) {
        setLocationSetupOpen(false)
        return
      }

      if (!userLocation.ready) return

      // Never use IP/fallback as Yerel authority.
      if (
        userLocation.citySlug &&
        userLocation.source !== 'fallback' &&
        userLocation.source !== 'ip'
      ) {
        applyLocalCity(
          userLocation.citySlug,
          userLocation.cityName,
          userLocation.source as 'geolocation' | 'manual' | 'profile' | 'cookie'
        )
        void loadPage(false, null, 'local', false, null)
        return
      }

      setLocationSetupOpen(true)
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [
    mode,
    authUser?.uid,
    localCitySlug,
    userLocation.ready,
    userLocation.citySlug,
    userLocation.cityName,
    userLocation.source,
    applyLocalCity,
    loadPage,
  ])

  const handleTabChange = useCallback(
    (tab: FeedV2Tab) => {
      const nextMode = tab.mode ?? 'personal'
      const nextCategory = tab.kind === 'category' ? tab.category ?? null : null
      if (tab.id === activeTabId && items.length > 0) return
      clearFeedRestore()
      restoreAppliedRef.current = false
      pendingRestoreScrollRef.current = null
      setActiveTabId(tab.id)
      setMode(nextMode)
      setCategory(nextCategory)
      // Keep current cards painted while the next category loads — avoids full black wait.
      // loadPage(false, …) still replaces items when the new page arrives.
      setCursor(null)
      cursorRef.current = null
      setActiveIndex(0)
      activeIndexRef.current = 0
      setErrorState(null)
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0
      }
      const params = new URLSearchParams(searchParams.toString())
      if (nextCategory) {
        params.set('category', nextCategory)
        params.delete('mode')
      } else {
        params.delete('category')
        if (nextMode === 'personal') params.delete('mode')
        else params.set('mode', nextMode)
      }
      const q = params.toString()
      router.replace(q ? `/feed-v2?${q}` : '/feed-v2', { scroll: false })

      if (nextMode === 'local' && !nextCategory) {
        const city = resolveFeedCity('local')
        if (!city) {
          setLocationSetupOpen(true)
          setLoading(false)
          setItems([])
          itemsRef.current = []
          setHasMore(false)
          return
        }
        if (!localCitySlugRef.current) {
          localCitySlugRef.current = city
          setLocalCitySlug(city)
          setLocalCityName(getCityCategoryName(city))
        }
      } else {
        setLocationSetupOpen(false)
      }

      void loadPage(false, null, nextMode, false, nextCategory)
    },
    [activeTabId, items.length, loadPage, resolveFeedCity, router, searchParams]
  )

  // Boot / auth only — must NOT depend on mode/category.
  // Tab chips call loadPage directly; including mode/category here previously
  // re-ran this effect and aborted the in-flight category fetch.
  useEffect(() => {
    // Article detail → back: hydrate snapshot instead of re-ranking from card 0.
    if (!restoreAppliedRef.current) {
      const pending = consumePendingFeedRestore()
      if (pending) {
        restoreAppliedRef.current = true
        personalizedOnceRef.current = true
        setMode(pending.mode)
        setItems(pending.items ?? [])
        setCursor(pending.cursor ?? null)
        cursorRef.current = pending.cursor ?? null
        setHasMore(pending.hasMore ?? true)
        hasMoreRef.current = pending.hasMore ?? true
        setActiveIndex(pending.scrollIndex)
        activeIndexRef.current = pending.scrollIndex
        pendingRestoreScrollRef.current = pending.scrollIndex
        setLoading(false)
        clearFeedRestore()
        return
      }
    } else {
      // Keep restored corpus across authReady flicker; do not restart at card 0.
      return
    }

    const hasCards = itemsRef.current.length > 0

    // Keep SSR/bootstrap cards visible while Firebase profile still loads.
    if (authLoading && hasCards) return

    // Auth ready as guest — no personalization pass needed.
    if (!authLoading && !authUser) {
      personalizedOnceRef.current = true
    }

    // One soft refresh after login so personal ranking applies — only at card 0.
    if (
      !authLoading &&
      authUser?.uid &&
      hasCards &&
      !personalizedOnceRef.current &&
      activeIndexRef.current === 0
    ) {
      personalizedOnceRef.current = true
      void loadPage(false, null, 'personal', true, null)
      return
    }

    // Cold start / no SSR: fetch immediately — do not wait for auth profile.
    if (!hasCards) {
      void loadPage(false)
    }
  }, [authLoading, authUser?.uid, loadPage])

  // After restore hydrate (or index set), snap scroll to global index (WINDOW_MAX safe).
  useLayoutEffect(() => {
    const target = pendingRestoreScrollRef.current
    if (target == null || !items.length || loading) return
    const el = scrollRef.current
    if (!el) return
    const h = cardHeightRef.current || el.clientHeight || 1
    const clamped = Math.max(0, Math.min(target, items.length - 1))
    programmaticScrollRef.current = true
    el.scrollTo({ top: clamped * h, behavior: 'auto' })
    setActiveIndex(clamped)
    activeIndexRef.current = clamped
    pendingRestoreScrollRef.current = null
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false
    })
  }, [items, loading])

  const syncCardHeight = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const measured =
      Math.round(el.clientHeight) ||
      Math.round(typeof window !== 'undefined' ? window.visualViewport?.height ?? window.innerHeight : 0)
    if (measured <= 0) return
    const prev = cardHeightRef.current
    cardHeightRef.current = measured
    el.style.setProperty('--feed-card-h', `${measured}px`)
    if (measured !== cardHeightPx) setCardHeightPx(measured)
    // Safari toolbar: keep the same GLOBAL card when the unit height changes.
    if (prev > 0 && prev !== measured && items.length > 0) {
      programmaticScrollRef.current = true
      el.scrollTop = activeIndexRef.current * measured
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false
      })
    }
  }, [cardHeightPx, items.length])

  useLayoutEffect(() => {
    syncCardHeight()
  }, [syncCardHeight, loading, items.length])

  useEffect(() => {
    const onResize = () => syncCardHeight()
    window.addEventListener('resize', onResize)
    const vv = window.visualViewport
    vv?.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      vv?.removeEventListener('resize', onResize)
    }
  }, [syncCardHeight])

  useEffect(() => {
    if (!items.length) return
    const ids = items.map((i) => i.articleId)
    let cancelled = false
    socialApi
      .getArticleState(ids)
      .then((res) => {
        if (cancelled) return
        const states =
          (res as {
            states?: Array<{
              articleId: string
              liked: boolean
              saved: boolean
              likeCount?: number
              commentCount?: number
              saveCount?: number
            }>
          }).states ?? []
        if (!states.length) return
        setSocial((prev) => {
          const next = { ...prev }
          for (const s of states) {
            const existing = next[s.articleId]
            const dto = items.find((i) => i.articleId === s.articleId)
            next[s.articleId] = {
              liked: s.liked,
              saved: s.saved,
              likeCount:
                typeof s.likeCount === 'number'
                  ? s.likeCount
                  : (existing?.likeCount ?? dto?.socialCounts.likes ?? 0),
              commentCount:
                typeof s.commentCount === 'number'
                  ? s.commentCount
                  : (existing?.commentCount ?? dto?.socialCounts.comments ?? 0),
              saveCount:
                typeof s.saveCount === 'number'
                  ? s.saveCount
                  : (existing?.saveCount ?? dto?.socialCounts.saves ?? 0),
            }
          }
          return next
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [items, authUser?.uid])

  useEffect(() => {
    activeIndexRef.current = activeIndex
    dwellStartRef.current = Date.now()

    const remaining = items.length - activeIndex
    if (
      items.length > 0 &&
      remaining <= FEED_PAGINATION.prefetchThreshold &&
      hasMore &&
      !loadingMore &&
      !loadingMoreRef.current
    ) {
      void loadPage(true, cursor)
    }
  }, [activeIndex, items.length, hasMore, loadingMore, cursor, loadPage])

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current
      if (!el) return
      const h = cardHeightRef.current || el.clientHeight || 1
      const clamped = Math.max(0, Math.min(index, Math.max(0, items.length - 1)))
      programmaticScrollRef.current = true
      el.scrollTo({
        top: clamped * h,
        behavior: reducedMotion ? 'auto' : 'smooth',
      })
      setActiveIndex(clamped)
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false
      })
    },
    [reducedMotion, items.length]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        scrollToIndex(Math.min(activeIndexRef.current + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        scrollToIndex(Math.max(activeIndexRef.current - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items.length, scrollToIndex])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || programmaticScrollRef.current) return
    const h = cardHeightRef.current || el.clientHeight || 1
    // Global index: top spacer height + card heights map 1:1 with items[].
    const idx = Math.round(el.scrollTop / h)
    if (idx !== activeIndexRef.current && idx >= 0 && idx < items.length) {
      const prev = items[activeIndexRef.current]
      const dwell = dwellStartRef.current ? Date.now() - dwellStartRef.current : 0
      if (prev && dwell < 1500) {
        void postTelemetry({
          events: [
            {
              eventType: 'quick_skip',
              articleId: prev.articleId,
              feedType: mode,
              dwellMs: dwell,
              metadata: {
                category: prev.category ?? null,
                tags: prev.tags ?? [],
                publisherId: prev.publisher?.id ?? null,
              },
            },
          ],
        })
      }
      setActiveIndex(idx)
    }
  }, [items, mode])

  const recordImpression = useCallback(
    (item: FeedItemDto) => {
      const guestSeen = readGuestSeen()
      for (const key of feedItemIdentityKeys(item)) guestSeen.add(key)
      writeGuestSeen(guestSeen)
      void postTelemetry({
        events: [{ eventType: 'feed_impression', articleId: item.articleId, feedType: mode }],
        impressions: [
          {
            articleId: item.articleId,
            clusterId: item.clusterId,
            publisherId: item.publisher?.id ?? null,
            feedType: mode,
          },
        ],
      })
    },
    [mode]
  )

  const socialMutationError = (err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'ARTICLE_NOT_FOUND') return 'Bu haber için etkileşim henüz açılamadı.'
    if (msg === 'AUTH_REQUIRED' || msg === 'Unauthorized') return 'Bu işlem için giriş yapmalısınız.'
    if (msg === 'Social graph disabled') return 'Sosyal özellikler şu an kapalı.'
    if (msg === 'PUBLISHER_NOT_FOUND') return 'Yayıncı bulunamadı.'
    return fallback
  }

  const toggleLike = useCallback(
    async (item: FeedItemDto) => {
      if (actionLoading[item.articleId]) return
      if (authLoading) {
        toast.error('Oturum hazırlanıyor, tekrar deneyin')
        return
      }
      await ensureAuthReady()
      if (!authUser || !auth.currentUser) {
        const returnUrl = `/feed-v2${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
        const intent = buildAuthIntent('LIKE', 'article', item.articleId, returnUrl)
        if (intent) router.push(loginHrefWithIntent(intent))
        else router.push(`/login?next=${encodeURIComponent(returnUrl)}`)
        return
      }

      const current = social[item.articleId] ?? {
        liked: item.socialState?.liked ?? false,
        saved: item.socialState?.saved ?? false,
        likeCount: item.socialCounts.likes ?? 0,
        commentCount: item.socialCounts.comments ?? 0,
        saveCount: item.socialCounts.saves ?? 0,
      }

      const prevLiked = current.liked
      const prevCount = current.likeCount
      const nextLiked = !prevLiked
      const nextCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1)

      setActionLoading((s) => ({ ...s, [item.articleId]: 'like' }))

      setSocial((s) => ({
        ...s,
        [item.articleId]: {
          ...(s[item.articleId] ?? current),
          liked: nextLiked,
          likeCount: nextCount,
        },
      }))

      try {
        const res = prevLiked
          ? await socialApi.unlikeArticle(item.articleId)
          : await socialApi.likeArticle(item.articleId)

        const body = res as { liked?: boolean; likeCount?: number; likes?: number }
        const canonicalLikes =
          typeof body.likeCount === 'number'
            ? body.likeCount
            : typeof body.likes === 'number'
              ? body.likes
              : undefined
        const canonicalLiked = typeof body.liked === 'boolean' ? body.liked : nextLiked

        setSocial((s) => ({
          ...s,
          [item.articleId]: {
            ...(s[item.articleId] ?? current),
            liked: canonicalLiked,
            likeCount: canonicalLikes !== undefined ? canonicalLikes : nextCount,
          },
        }))
      } catch (err) {
        setSocial((s) => ({
          ...s,
          [item.articleId]: {
            ...(s[item.articleId] ?? current),
            liked: prevLiked,
            likeCount: prevCount,
          },
        }))
        toast.error(socialMutationError(err, 'Beğeni kaydedilemedi'))
      } finally {
        setActionLoading((s) => {
          const next = { ...s }
          delete next[item.articleId]
          return next
        })
      }
    },
    [actionLoading, authUser, authLoading, router, searchParams, social]
  )

  const applyReaction = useCallback(
    async (item: FeedItemDto, reaction: string) => {
      if (actionLoading[item.articleId]) return
      if (authLoading) {
        toast.error('Oturum hazırlanıyor, tekrar deneyin')
        return
      }
      await ensureAuthReady()
      if (!authUser || !auth.currentUser) {
        const returnUrl = `/feed-v2${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
        const intent = buildAuthIntent('LIKE', 'article', item.articleId, returnUrl)
        if (intent) router.push(loginHrefWithIntent(intent))
        else router.push(`/login?next=${encodeURIComponent(returnUrl)}`)
        return
      }

      const current = social[item.articleId] ?? {
        liked: item.socialState?.liked ?? false,
        saved: item.socialState?.saved ?? false,
        likeCount: item.socialCounts.likes ?? 0,
        commentCount: item.socialCounts.comments ?? 0,
        saveCount: item.socialCounts.saves ?? 0,
        reaction: null,
      }

      const prevLiked = current.liked
      const prevCount = current.likeCount
      const prevReaction = current.reaction ?? null
      const nextCount = prevLiked ? prevCount : prevCount + 1

      setActionLoading((s) => ({ ...s, [item.articleId]: 'like' }))
      setSocial((s) => ({
        ...s,
        [item.articleId]: {
          ...(s[item.articleId] ?? current),
          liked: true,
          likeCount: nextCount,
          reaction,
        },
      }))

      try {
        const res = await socialApi.likeArticle(item.articleId, reaction)
        const body = res as { liked?: boolean; likeCount?: number; likes?: number }
        const canonicalLikes =
          typeof body.likeCount === 'number'
            ? body.likeCount
            : typeof body.likes === 'number'
              ? body.likes
              : undefined
        setSocial((s) => ({
          ...s,
          [item.articleId]: {
            ...(s[item.articleId] ?? current),
            liked: true,
            likeCount: canonicalLikes !== undefined ? canonicalLikes : nextCount,
            reaction,
          },
        }))
      } catch (err) {
        setSocial((s) => ({
          ...s,
          [item.articleId]: {
            ...(s[item.articleId] ?? current),
            liked: prevLiked,
            likeCount: prevCount,
            reaction: prevReaction,
          },
        }))
        toast.error(socialMutationError(err, 'Tepki kaydedilemedi'))
      } finally {
        setActionLoading((s) => {
          const next = { ...s }
          delete next[item.articleId]
          return next
        })
      }
    },
    [actionLoading, authUser, authLoading, router, searchParams, social]
  )

  const toggleSave = useCallback(
    async (item: FeedItemDto) => {
      if (actionLoading[item.articleId]) return
      if (authLoading) {
        toast.error('Oturum hazırlanıyor, tekrar deneyin')
        return
      }
      await ensureAuthReady()
      if (!authUser || !auth.currentUser) {
        const returnUrl = `/feed-v2${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
        const intent = buildAuthIntent('SAVE', 'article', item.articleId, returnUrl)
        if (intent) router.push(loginHrefWithIntent(intent))
        else router.push(`/login?next=${encodeURIComponent(returnUrl)}`)
        return
      }

      const current = social[item.articleId] ?? {
        liked: item.socialState?.liked ?? false,
        saved: item.socialState?.saved ?? false,
        likeCount: item.socialCounts.likes ?? 0,
        commentCount: item.socialCounts.comments ?? 0,
        saveCount: item.socialCounts.saves ?? 0,
      }

      const prevSaved = current.saved
      const prevSaveCount = current.saveCount
      const nextSaved = !prevSaved
      const nextSaveCount = nextSaved ? prevSaveCount + 1 : Math.max(0, prevSaveCount - 1)

      setActionLoading((s) => ({ ...s, [item.articleId]: 'save' }))

      setSocial((s) => ({
        ...s,
        [item.articleId]: {
          ...(s[item.articleId] ?? current),
          saved: nextSaved,
          saveCount: nextSaveCount,
        },
      }))

      try {
        const res = prevSaved
          ? await socialApi.unsaveArticle(item.articleId)
          : await socialApi.saveArticle(item.articleId)

        const body = res as { saved?: boolean; saveCount?: number; saves?: number }
        const canonicalSaved = typeof body.saved === 'boolean' ? body.saved : nextSaved
        const canonicalSaves =
          typeof body.saveCount === 'number'
            ? body.saveCount
            : typeof body.saves === 'number'
              ? body.saves
              : undefined

        setSocial((s) => ({
          ...s,
          [item.articleId]: {
            ...(s[item.articleId] ?? current),
            saved: canonicalSaved,
            saveCount: canonicalSaves !== undefined ? canonicalSaves : nextSaveCount,
          },
        }))
      } catch (err) {
        setSocial((s) => ({
          ...s,
          [item.articleId]: {
            ...(s[item.articleId] ?? current),
            saved: prevSaved,
            saveCount: prevSaveCount,
          },
        }))
        toast.error(socialMutationError(err, 'Kaydetme işlemi başarısız'))
      } finally {
        setActionLoading((s) => {
          const next = { ...s }
          delete next[item.articleId]
          return next
        })
      }
    },
    [actionLoading, authUser, authLoading, router, searchParams, social]
  )

  const handleFeedback = useCallback((articleId: string) => {
    setItems((prev) => prev.filter((i) => i.articleId !== articleId))
  }, [])

  const handleCommentAdded = useCallback((articleId: string, nextCommentCount?: number) => {
    setSocial((s) => {
      const existing = s[articleId]
      const base = existing ?? {
        liked: false,
        saved: false,
        likeCount: 0,
        commentCount: 0,
        saveCount: 0,
      }
      return {
        ...s,
        [articleId]: {
          ...base,
          commentCount:
            typeof nextCommentCount === 'number'
              ? nextCommentCount
              : base.commentCount + 1,
        },
      }
    })
  }, [])

  const openReader = useCallback((item: FeedItemDto, index: number) => {
    // Keep Feed mounted — no restore snapshot needed for overlay path.
    setReaderItem({ item, index })
  }, [])

  const onRead = (item: FeedItemDto, index: number) => {
    void (async () => {
      // Durable consumed: guest localStorage + server article_opened (not qualified impression).
      const guestSeen = readGuestSeen()
      for (const key of feedItemIdentityKeys(item)) guestSeen.add(key)
      writeGuestSeen(guestSeen)

      const enabled = await resolveFeedReaderEnabledForOpen()
      void postTelemetry({
        events: [
          {
            eventType: 'article_opened',
            articleId: item.articleId,
            clusterId: item.clusterId,
            feedType: mode,
            metadata: {
              publisherId: item.publisher?.id ?? null,
              category: item.category ?? null,
              tags: item.tags ?? [],
              source: enabled ? 'feed_reader' : 'news_detail',
            },
          },
        ],
      })

      if (enabled) {
        openReader(item, index)
        return
      }

      // Capability still pending (auth hydrating) — do not fall back to /haber yet.
      if (authLoading || !readerCapabilityReadyRef.current) return

      // Legacy path: navigate to canonical article page (non-pilot / guest).
      saveFeedRestore({
        mode,
        articleId: item.articleId,
        cursor,
        hasMore,
        scrollIndex: index,
        items,
        timestamp: Date.now(),
        pending: true,
      })
      router.push(ROUTES.NEWS_DETAIL(item.slug))
    })()
  }

  const onReaderCloseTelemetry = useCallback(
    (payload: FeedReaderTelemetryPayload) => {
      void postTelemetry({
        events: [
          {
            eventType: 'article_dwell',
            articleId: payload.articleId,
            clusterId: payload.clusterId,
            feedType: mode,
            dwellMs: payload.dwellMs,
            metadata: {
              publisherId: payload.publisherId,
              category: payload.category,
              tags: payload.tags,
              source: 'feed_reader',
              readDepthMax: payload.readDepthMax,
              readDepthThresholds: payload.thresholdsHit,
            },
          },
        ],
      })
    },
    [mode]
  )

  const emptyState = useMemo(() => {
    if (loading) return null
    if (mode === 'following') {
      return {
        title: 'Takip Ettiğin Yayıncı Yok',
        description: 'Henüz takip ettiğin yayıncı yok veya yeni bir paylaşımları bulunmuyor.',
      }
    }
    if (mode === 'local') {
      if (locationSetupOpen || !localCitySlug) {
        return {
          title: 'Konumunu Belirle',
          description: 'Yalnızca kendi şehrindeki yerel haberleri görmek için konumunu paylaş veya şehrini seç.',
        }
      }
      return {
        title: `${localCityName || 'Şehrin'} için Yerel Haber Yok`,
        description: `${localCityName || 'Bu konum'}da şu an gösterilecek yerel haber bulunmuyor.`,
      }
    }
    if (mode === 'breaking') {
      return {
        title: 'Son Dakika Yok',
        description: 'Şu an son dakika haberi bulunmuyor.',
      }
    }
    if (category) {
      return {
        title: 'Bu Kategoride Haber Yok',
        description: 'Bu kategoride şu an gösterilecek haber kalmadı. Başka bir kategori deneyin.',
      }
    }
    return {
      title: 'Haber Akışı Boş',
      description: 'Şu an gösterilecek haber bulunamadı.',
    }
  }, [loading, mode, category, locationSetupOpen, localCitySlug, localCityName])

  const isLoadingFirstTime = items.length === 0 && loading
  const isTabSwitching = loading && items.length > 0

  return (
    <div
      className="relative h-[100dvh] w-full bg-black overflow-hidden flex justify-center select-none"
      data-testid="smart-feed-root"
    >
      {/* Canonical Viewport Shell — Never collapses, preserves exact geometry */}
      <div
        className="relative h-[100dvh] w-full md:max-w-lg md:mx-auto overflow-hidden bg-black flex flex-col"
        data-testid="smart-feed-canonical-shell"
      >
        {/* Top category navigation — Always mounted */}
        <FeedV2CategoryNav
          activeTabId={activeTabId}
          onChange={handleTabChange}
          trailing={
            items[activeIndex] ? (
              <FeedCardMenu
                item={items[activeIndex]!}
                onFeedback={() => handleFeedback(items[activeIndex]!.articleId)}
              />
            ) : mode === 'local' && localCitySlug ? (
              <button
                type="button"
                onClick={() => setLocationSetupOpen(true)}
                className="flex max-w-[7.5rem] items-center gap-1 rounded-full bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white ring-1 ring-white/20"
                aria-label="Yerel konumunu değiştir"
                data-testid="smart-feed-local-city-chip"
              >
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{localCityName || localCitySlug}</span>
              </button>
            ) : null
          }
        />

        {isTabSwitching ? (
          <div
            className="pointer-events-none absolute left-3 right-3 z-[55] h-0.5 overflow-hidden rounded-full bg-white/15"
            style={{
              top: 'max(4.85rem, calc(var(--mobile-sat, env(safe-area-inset-top, 0px)) + 3.35rem))',
            }}
            data-testid="smart-feed-tab-loading"
            aria-hidden
          >
            <div className="h-full w-2/5 animate-pulse rounded-full bg-white/85" />
          </div>
        ) : null}

        {/* Viewport Content States */}
        {isLoadingFirstTime ? (
          /* Seamless Skeleton Loader matching FullscreenNewsCard geometry */
          <div className="h-[100dvh] w-full overflow-hidden" data-testid="smart-feed-skeleton-view">
            <FullscreenNewsCardSkeleton />
          </div>
        ) : errorState ? (
          /* Error / Auth Required / Pilot Preview State */
          <div
            className="flex h-[100dvh] w-full flex-col items-center justify-center px-6 text-center text-white/80"
            data-testid="smart-feed-error-view"
          >
            <div className="mb-4 rounded-full bg-white/10 p-4">
              {errorState.type === 'AUTH_REQUIRED' || errorState.type === 'DISABLED' ? (
                <ShieldAlert className="h-8 w-8 text-amber-400" />
              ) : (
                <AlertCircle className="h-8 w-8 text-red-400" />
              )}
            </div>
            <h2 className="mb-1 text-lg font-bold text-white">
              {errorState.type === 'AUTH_REQUIRED'
                ? 'Giriş Yapılması Gerekiyor'
                : errorState.type === 'DISABLED'
                  ? 'Akıllı Akış'
                  : 'Yükleme Hatası'}
            </h2>
            <p className="max-w-xs text-sm text-white/60 mb-6">{errorState.message}</p>
            {errorState.type === 'AUTH_REQUIRED' ? (
              <Link
                href={`/login?next=${encodeURIComponent('/feed-v2')}`}
                className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Giriş Yap
              </Link>
            ) : errorState.type === 'DISABLED' && !authUser ? (
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Link
                  href={`/login?next=${encodeURIComponent('/feed-v2')}`}
                  className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
                >
                  Giriş Yap
                </Link>
                <button
                  type="button"
                  onClick={() => void loadPage(false, null, undefined, true)}
                  className="flex items-center gap-2 rounded-full bg-white/20 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
                >
                  <RefreshCw className="h-4 w-4" />
                  Tekrar Dene
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void loadPage(false, null, undefined, true)}
                className="flex items-center gap-2 rounded-full bg-white/20 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <RefreshCw className="h-4 w-4" />
                Tekrar Dene
              </button>
            )}
            {isDebug ? (
              <div className="mt-4 rounded bg-white/5 px-3 py-1.5 text-xs text-amber-300">
                [DIAGNOSTIC] status: {errorState.type} | user: {authUser?.uid ?? 'guest'} | authLoading: {String(authLoading)} | reason: {errorState.type === 'DISABLED' ? errorState.reason ?? 'none' : 'none'} | mode: {mode}
              </div>
            ) : null}
          </div>
        ) : !items.length ? (
          /* Empty Feed State */
          <div
            className="flex h-[100dvh] w-full flex-col items-center justify-center px-6 text-center text-white/80"
            data-testid="smart-feed-empty-view"
          >
            <div className="mb-4 rounded-full bg-white/10 p-4">
              {mode === 'local' ? (
                <MapPin className="h-8 w-8 text-white/70" />
              ) : (
                <Inbox className="h-8 w-8 text-white/70" />
              )}
            </div>
            <h2 className="mb-1 text-lg font-bold text-white">{emptyState?.title}</h2>
            <p className="max-w-xs text-sm text-white/60 mb-4">{emptyState?.description}</p>
            {mode === 'local' && (locationSetupOpen || !localCitySlug) ? (
              <button
                type="button"
                onClick={() => setLocationSetupOpen(true)}
                className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-bold text-black transition hover:bg-white/90"
                data-testid="smart-feed-local-setup-cta"
              >
                <MapPin className="h-3.5 w-3.5" />
                Konumumu Belirle
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void loadPage(false)}
                className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Yenile
              </button>
            )}
            {mode === 'local' && localCitySlug ? (
              <button
                type="button"
                onClick={() => clearLocalCity()}
                className="mt-3 text-xs font-medium text-white/55 underline-offset-2 hover:underline"
              >
                Konumu değiştir ({localCityName || localCitySlug})
              </button>
            ) : null}
            {isDebug ? (
              <div className="mt-4 rounded bg-white/5 px-3 py-1.5 text-xs text-green-300">
                [DIAGNOSTIC] status: EMPTY_INVENTORY | user: {authUser?.uid ?? 'guest'} | items: 0 | mode: {mode} | city: {localCitySlug ?? 'none'}
              </div>
            ) : null}
          </div>
        ) : (
          /* Populated Snap Scroll Feed */
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className={cn(
              'h-[100dvh] w-full snap-y snap-mandatory overflow-y-scroll transition-opacity duration-200',
              isTabSwitching && 'opacity-55',
              feedScrollLocked && 'overflow-hidden touch-none'
            )}
            style={
              {
                scrollSnapType: reducedMotion ? 'none' : 'y mandatory',
                ['--feed-card-h' as string]: cardHeightPx > 0 ? `${cardHeightPx}px` : undefined,
              } as CSSProperties
            }
            role="feed"
            aria-label="Akıllı haber akışı"
            data-testid="smart-feed-scroll-container"
            data-window-start={windowStart}
            data-items-length={items.length}
            data-active-index={activeIndex}
            data-has-more={hasMore ? 'true' : 'false'}
            data-card-height={cardHeightPx || undefined}
          >
            {windowStart > 0 ? (
              <div
                aria-hidden
                data-testid="smart-feed-spacer-before"
                className="w-full shrink-0"
                style={{ height: `calc(${windowStart} * var(--feed-card-h, 100dvh))` }}
              />
            ) : null}
            {windowItems.map((item, wi) => {
              const index = windowStart + wi
              const isActive = index === activeIndex
              const socialState = social[item.articleId]
              const liked = socialState?.liked ?? item.socialState?.liked ?? false
              const saved = socialState?.saved ?? item.socialState?.saved ?? false
              const likeCount = socialState?.likeCount ?? item.socialCounts.likes ?? 0
              const commentCount = socialState?.commentCount ?? item.socialCounts.comments ?? 0
              const saveCount = socialState?.saveCount ?? item.socialCounts.saves ?? 0
              const reaction = socialState?.reaction ?? null

              return (
                <FeedCardWithImpression
                  key={item.articleId}
                  item={item}
                  isActive={isActive}
                  debug={isDebug}
                  liked={liked}
                  saved={saved}
                  likeCount={likeCount}
                  commentCount={commentCount}
                  saveCount={saveCount}
                  reaction={reaction}
                  cardIndex={index + 1}
                  cardTotal={Math.max(items.length, 1)}
                  likeLoading={actionLoading[item.articleId] === 'like'}
                  saveLoading={actionLoading[item.articleId] === 'save'}
                  onToggleLike={() => void toggleLike(item)}
                  onReact={(r) => void applyReaction(item, r)}
                  onToggleSave={() => void toggleSave(item)}
                  onCommentClick={() => setCommentArticleId(item.articleId)}
                  onReadClick={() => onRead(item, index)}
                  onImpression={() => recordImpression(item)}
                  onOpenReaderGesture={
                    feedReaderEnabled && readerCapabilityReady && isActive && !readerItem
                      ? (g) => {
                          dispatchFeedOpenGesture({
                            ...g,
                            onOpen: () => onRead(item, index),
                          })
                        }
                      : undefined
                  }
                  showDiscoveryRail={(index + 1) % 8 === 0 && index < items.length - 1}
                  discoveryCategory={category}
                  discoveryExcludeIds={items.map((i) => i.articleId)}
                />
              )
            })}
            {spacerAfter > 0 ? (
              <div
                aria-hidden
                data-testid="smart-feed-spacer-after"
                className="w-full shrink-0"
                style={{ height: `calc(${spacerAfter} * var(--feed-card-h, 100dvh))` }}
              />
            ) : null}
            {loadingMore ? (
              <div
                className="flex h-[var(--feed-card-h,100dvh)] w-full snap-start snap-always items-center justify-center bg-black"
                data-testid="smart-feed-loading-more"
              >
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            ) : null}
            {!hasMore && items.length > 0 ? (
              <div className="flex h-[var(--feed-card-h,100dvh)] w-full snap-start snap-always flex-col items-center justify-center bg-black px-6 text-center text-white">
                <div className="mb-4 rounded-full bg-white/10 p-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
                <h3 className="mb-2 text-xl font-bold">Tüm haberleri gördün</h3>
                <p className="mb-6 max-w-xs text-sm text-white/70">
                  Şimdilik bu kadar. Yeni gelişmeler geldikçe burada göreceksin.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    scrollToIndex(0)
                    void loadPage(false)
                  }}
                  className="flex items-center gap-2 rounded-full bg-white/20 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
                >
                  <RefreshCw className="h-4 w-4" />
                  Başa Dön ve Yenile
                </button>
              </div>
            ) : null}
          </div>
        )}

        {/* 3-Region Bottom Sheet for Comments */}
        <CommentsBottomSheet
          articleId={commentArticleId ?? ''}
          open={Boolean(commentArticleId)}
          onClose={() => setCommentArticleId(null)}
          initialCount={
            commentArticleId
              ? (social[commentArticleId]?.commentCount ??
                items.find((i) => i.articleId === commentArticleId)?.socialCounts.comments ??
                0)
              : 0
          }
          onCommentAdded={(nextCount) => {
            if (commentArticleId) handleCommentAdded(commentArticleId, nextCount)
          }}
        />

        {readerItem ? (
          <FeedArticleReader
            item={readerItem.item}
            open={Boolean(readerItem)}
            onClose={() => {
              const idx = readerItem.index
              setReaderItem(null)
              // Stay on same card index — Feed never unmounted.
              requestAnimationFrame(() => scrollToIndex(idx))
            }}
            onCloseTelemetry={onReaderCloseTelemetry}
            liked={social[readerItem.item.articleId]?.liked ?? readerItem.item.socialState?.liked ?? false}
            saved={social[readerItem.item.articleId]?.saved ?? readerItem.item.socialState?.saved ?? false}
            likeCount={
              social[readerItem.item.articleId]?.likeCount ?? readerItem.item.socialCounts.likes ?? 0
            }
            commentCount={
              social[readerItem.item.articleId]?.commentCount ??
              readerItem.item.socialCounts.comments ??
              0
            }
            saveCount={
              social[readerItem.item.articleId]?.saveCount ?? readerItem.item.socialCounts.saves ?? 0
            }
            onToggleLike={() => void toggleLike(readerItem.item)}
            onToggleSave={() => void toggleSave(readerItem.item)}
            onCommentClick={() => setCommentArticleId(readerItem.item.articleId)}
            onLockFeedScroll={setFeedScrollLocked}
          />
        ) : null}

        <LocalLocationSetupSheet
          open={mode === 'local' && locationSetupOpen}
          requestingGps={requestingGps}
          gpsDenied={gpsDenied}
          onAutoLocation={() => void startAutoLocation()}
          onSelectCity={handleSelectLocalCity}
        />
      </div>
    </div>
  )
}

function FeedCardWithImpression(props: {
  item: FeedItemDto
  isActive: boolean
  debug?: boolean
  liked: boolean
  saved: boolean
  likeCount?: number
  commentCount?: number
  saveCount?: number
  reaction?: string | null
  cardIndex?: number
  cardTotal?: number
  likeLoading?: boolean
  saveLoading?: boolean
  onToggleLike: () => void
  onReact?: (reaction: import('@/components/social/SocialActionRail').FeedReactionId) => void
  onToggleSave: () => void
  onCommentClick: () => void
  onReadClick: () => void
  onImpression: () => void
  onOpenReaderGesture?: (g: {
    dx: number
    dy: number
    startClientX: number
    viewportWidth: number
    velocityX: number
  }) => void
  showDiscoveryRail?: boolean
  discoveryCategory?: string | null
  discoveryExcludeIds?: string[]
}) {
  const { onOpenReaderGesture, ...cardProps } = props
  const impressionRef = useFeedImpressionRef(props.item.articleId, props.isActive, props.onImpression)
  const drag = useRef<{
    x: number
    y: number
    t: number
    lastX: number
    lastT: number
  } | null>(null)

  return (
    <div
      className="relative touch-pan-y"
      data-testid="smart-feed-card-gesture-surface"
      onPointerDown={(e) => {
        if (!onOpenReaderGesture || !props.isActive) return
        if (e.pointerType === 'mouse' && e.button !== 0) return
        if (shouldIgnoreFeedOpenGestureTarget(e.target)) return
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          t: performance.now(),
          lastX: e.clientX,
          lastT: performance.now(),
        }
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Non-fatal: some browsers reject capture on certain targets.
        }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        drag.current.lastX = e.clientX
        drag.current.lastT = performance.now()
      }}
      onPointerUp={(e) => {
        if (!onOpenReaderGesture || !drag.current) return
        const d = drag.current
        drag.current = null
        try {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
        } catch {
          // ignore
        }
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        const dt = Math.max(1, performance.now() - d.lastT)
        const velocityX = (e.clientX - d.lastX) / dt
        onOpenReaderGesture({
          dx,
          dy,
          startClientX: d.x,
          viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 390,
          velocityX,
        })
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
    >
      <FullscreenNewsCard {...cardProps} cardRef={impressionRef} />
    </div>
  )
}
