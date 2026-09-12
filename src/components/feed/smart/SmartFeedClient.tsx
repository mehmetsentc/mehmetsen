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
import {
  FEED_READER_SURFACE_CLASS,
  FEED_V2_CHROME_CSS_VARS,
} from '@/lib/feed/reader/feedChrome'
import { captureFeedV2EntryFromReferrer } from '@/lib/feed/reader/feedV2Exit'
import { tryLockFeedPortraitOrientation } from '@/lib/feed/reader/feedPortrait'
import { CommentsBottomSheet } from '@/components/feed/smart/CommentsBottomSheet'
import { FeedArticleBottomSheet } from '@/components/feed/smart/FeedArticleBottomSheet'
import {
  FeedArticleReader,
  type FeedReaderTelemetryPayload,
} from '@/components/feed/smart/FeedArticleReader'
import {
  classifyFeedOpenGestureDecision,
  dispatchFeedOpenGesture,
  shouldIgnoreFeedOpenGestureTarget,
} from '@/lib/feed/reader/feedOpenGesture'
import { nestedFeedContentCanScroll } from '@/lib/feed/reader/nestedFeedScroll'
import {
  classifyAxisIntent,
  feedToReaderProgress,
  isStillHoldMovement,
  prefersReducedMotion,
  READER_GESTURE,
  shouldCompleteTransition,
  shouldIgnoreSystemBackEdge,
} from '@/lib/feed/reader/gestureArbitration'
import { FEED_READER_DURATION_MS, FEED_READER_EASING } from '@/lib/feed/reader/tokens'
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
import {
  EMPTY_FEED_READER_DEBUG,
  buildFeedReaderDebugBadgeLines,
  decideFeedReadAction,
  mapClickDebugFromDecision,
  resolveGrantBackedPilotMatch,
  shouldShowFeedReaderDebugPanel,
  type FeedReaderDebugSnapshot,
} from '@/lib/feed/reader/readerDebug'
import {
  EMPTY_SWIPE_EVENT_HUD,
  appendSwipeEventSequence,
  formatSwipeEventHudLines,
  readTouchActionForTarget,
  shouldShowFeedSwipeEventHud,
  targetTagName,
  type FeedSwipeEventHudSnapshot,
} from '@/lib/feed/reader/swipeEventHud'
import {
  appendSwipeLifecycleRing,
  formatSwipeLifecycleRing,
  shouldIgnoreFeedOpenCancel,
  type SwipeLifecycleEvent,
} from '@/lib/feed/reader/swipeLifecycle'
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
import { createFeedSessionId } from '@/lib/feed/reader/history'
import {
  createFeedReaderCapabilitySession,
  settleFeedReaderCapabilitySession,
  sessionReaderOpenEligible,
} from '@/lib/feed/reader/capabilitySession'
import {
  recordReaderNavTrace,
  setReaderNavTraceEnabled,
} from '@/lib/feed/reader/navTrace'
import { markSwipeDiscoveryLearned } from '@/lib/feed/reader/swipeDiscoveryCoach'
import { ROUTES } from '@/constants/routes'
import { parseFeedV2TabFromSearch, resolveFeedV2TabForArticleCategory, type FeedV2Tab } from '@/lib/feed/feedV2Tabs'
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
  /**
   * overlay (default) = Feed V2 page-turn Reader.
   * sheet = Feed V3 bottom-sheet article (local experiment).
   */
  presentation?: 'overlay' | 'sheet'
}

export function SmartFeedClient({
  initialCitySlug,
  initialDistrictSlug,
  initialPage = null,
  debug,
  presentation = 'overlay',
}: SmartFeedClientProps) {
  const sheetMode = presentation === 'sheet'
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
  const [category, setCategory] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const restore = readFeedRestore()
      if (restore?.pending && restore.category !== undefined) return restore.category ?? null
    }
    return parseFeedV2TabFromSearch({
      mode: searchParams.get('mode'),
      category: searchParams.get('category'),
    }).category
  })
  const [activeTabId, setActiveTabId] = useState(() => {
    if (typeof window !== 'undefined') {
      const restore = readFeedRestore()
      if (restore?.pending) {
        return parseFeedV2TabFromSearch({
          mode: restore.mode,
          category: restore.category ?? null,
        }).tabId
      }
    }
    return parseFeedV2TabFromSearch({
      mode: searchParams.get('mode'),
      category: searchParams.get('category'),
    }).tabId
  })
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
  /** Feed↔Reader session: progress drives interactive page-turn; committed owns history. */
  const [readerSession, setReaderSession] = useState<{
    item: FeedItemDto
    index: number
    progress: number
    committed: boolean
    progressAnimating: boolean
    /** Stable React identity for one open attempt — never flip on commit. */
    generation: number
    openSource?: 'swipe' | 'swipe_affordance' | 'haberi_oku' | 'unknown'
  } | null>(null)
  const readerGenerationRef = useRef(0)
  /** Feed V3 bottom-sheet article session (presentation === 'sheet'). */
  const [sheetArticle, setSheetArticle] = useState<{
    item: FeedItemDto
    index: number
  } | null>(null)
  const feedSessionIdRef = useRef(createFeedSessionId())
  const readerItem = readerSession
    ? { item: readerSession.item, index: readerSession.index }
    : null
  const readerOpenRampRef = useRef<number | null>(null)
  const readerCancelGenRef = useRef(0)
  /** Single-open guard: articleId while ramp/open in progress. */
  const readerOpenGuardRef = useRef<string | null>(null)
  /**
   * Feed gesture decided OPEN on pointerup; onRead→openReader may still be awaiting.
   * While set, preview pointercancel must not wipe the opening session (iOS up→cancel).
   */
  const feedGestureCommitLockRef = useRef<string | null>(null)
  /** Bumped on Reader close / failed open — card surfaces reset stale drag listeners. */
  const [feedGestureEpoch, setFeedGestureEpoch] = useState(0)
  const swipeLifecycleRef = useRef<string[]>([])
  const [feedReaderEnabled, setFeedReaderEnabled] = useState(false)
  const [readerCapabilityReady, setReaderCapabilityReady] = useState(false)
  const [feedScrollLocked, setFeedScrollLocked] = useState(false)
  const [social, setSocial] = useState<Record<string, SocialItemState>>({})
  const [actionLoading, setActionLoading] = useState<Record<string, 'like' | 'save'>>({})
  const restoreAppliedRef = useRef(false)
  const pendingRestoreScrollRef = useRef<number | null>(null)
  /** Qualified impressions already fired this Feed session (warm restore must not re-fire). */
  const impressedArticleIdsRef = useRef<Set<string>>(new Set())
  const modeRef = useRef(mode)
  modeRef.current = mode
  const categoryRef = useRef(category)
  categoryRef.current = category
  const authUidRef = useRef<string | null>(authUser?.uid ?? null)
  authUidRef.current = authUser?.uid ?? null
  const cardHeightRef = useRef(0)
  const programmaticScrollRef = useRef(false)
  const [cardHeightPx, setCardHeightPx] = useState(0)
  const feedReaderEnabledRef = useRef(false)
  const readerCapabilityReadyRef = useRef(false)
  const readerCapabilityGenerationRef = useRef(0)
  const readerCapabilityAbortRef = useRef<AbortController | null>(null)
  const capabilityErrorRef = useRef(false)
  /** Authoritative ENABLED latch for this Feed mount — survives transient fetch errors. */
  const capabilitySessionRef = useRef(createFeedReaderCapabilitySession())
  const [readerDebug, setReaderDebug] = useState<FeedReaderDebugSnapshot>(EMPTY_FEED_READER_DEBUG)
  const [swipeHud, setSwipeHud] = useState<FeedSwipeEventHudSnapshot>(EMPTY_SWIPE_EVENT_HUD)

  const isDebug = Boolean(debug || searchParams.get('debug') === '1')
  const readerDebugQuery = searchParams.get('readerDebug') === '1'
  const showSwipeEventHud = shouldShowFeedSwipeEventHud({
    readerDebugQuery,
    currentMatchesActiveFeedReaderGrant: readerDebug.currentMatchesActiveFeedReaderGrant,
  })
  const pushSwipeLifecycle = useCallback(
    (event: SwipeLifecycleEvent) => {
      swipeLifecycleRef.current = appendSwipeLifecycleRing(swipeLifecycleRef.current, event)
      setSwipeHud((prev) => ({
        ...prev,
        lifecycle: formatSwipeLifecycleRing(swipeLifecycleRef.current),
        commitLock: Boolean(feedGestureCommitLockRef.current),
        gestureEpoch: feedGestureEpoch,
      }))
    },
    [feedGestureEpoch]
  )
  useEffect(() => {
    captureFeedV2EntryFromReferrer()
  }, [])
  useEffect(() => {
    void tryLockFeedPortraitOrientation()
  }, [])
  useEffect(() => {
    setReaderNavTraceEnabled(readerDebugQuery)
    if (readerDebugQuery) {
      recordReaderNavTrace({
        type: 'feed_mount',
        pathname: '/feed-v2',
        search: typeof window !== 'undefined' ? window.location.search : '',
        historyLength: typeof window !== 'undefined' ? window.history.length : 0,
        readerOpenId: null,
        feedSessionId: feedSessionIdRef.current,
        readerMounted: false,
        feedMounted: true,
        readerState: 'closed',
        mode,
        category,
      })
    }
    return () => {
      // Warm Feed V2 tab return: persist snapshot on route exit (Profile/Search/etc).
      const list = itemsRef.current
      const idx = activeIndexRef.current
      const current = list[idx]
      if (current && list.length > 0) {
        saveFeedRestore({
          mode: modeRef.current,
          category: categoryRef.current,
          articleId: current.articleId,
          cursor: cursorRef.current,
          hasMore: hasMoreRef.current,
          scrollIndex: idx,
          items: list,
          timestamp: Date.now(),
          pending: true,
          source: 'route_exit',
          userKey: authUidRef.current ?? 'guest',
          impressedArticleIds: [...impressedArticleIdsRef.current],
        })
      }
      if (readerDebugQuery) {
        recordReaderNavTrace({
          type: 'feed_unmount',
          pathname: typeof window !== 'undefined' ? window.location.pathname : '/feed-v2',
          search: typeof window !== 'undefined' ? window.location.search : '',
          historyLength: typeof window !== 'undefined' ? window.history.length : 0,
          readerOpenId: null,
          feedSessionId: feedSessionIdRef.current,
          readerMounted: false,
          feedMounted: false,
          readerState: 'closed',
          mode: modeRef.current,
          category: categoryRef.current,
        })
      }
      // Keep the trace enabled after Feed unmount so /feed-v2 → / remains inspectable.
    }
  }, [readerDebugQuery])
  const showReaderDebug = shouldShowFeedReaderDebugPanel({
    readerDebugQuery,
    uid: authUser?.uid,
  })
  const socialEnabled = isSocialGraphEnabledClient()
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const patchReaderDebug = useCallback((patch: Partial<FeedReaderDebugSnapshot>) => {
    setReaderDebug((prev) => ({ ...prev, ...patch }))
  }, [])

  const applyFeedReaderCapability = useCallback(
    (
      enabled: boolean,
      meta?: {
        httpStatus?: number | null
        errorCode?: string | null
        globalDefault?: boolean | null
        serverAuthenticated?: boolean | null
        clientAuthenticated?: boolean
        error?: boolean
        identityDebug?: import('@/lib/feed/reader/capabilityClient').FeedReaderIdentityDebug | null
      }
    ) => {
      const transportError = Boolean(meta?.error)
      const authenticated = Boolean(
        typeof meta?.clientAuthenticated === 'boolean'
          ? meta.clientAuthenticated
          : typeof meta?.serverAuthenticated === 'boolean'
            ? meta.serverAuthenticated
            : enabled
      )
      const nextSession = settleFeedReaderCapabilitySession(capabilitySessionRef.current, {
        authLoading: false,
        authenticated,
        ready: !transportError,
        enabled: transportError ? false : enabled,
        transportError,
      })
      capabilitySessionRef.current = nextSession

      const effectiveEnabled = sessionReaderOpenEligible(nextSession)
      feedReaderEnabledRef.current = effectiveEnabled
      setFeedReaderEnabled(effectiveEnabled)
      // Settled after any apply — latch or transport. PENDING only while authLoading before first settle.
      const ready = nextSession.authority !== 'unknown' && nextSession.authority !== 'pending'
      readerCapabilityReadyRef.current = ready
      setReaderCapabilityReady(ready)
      // capabilityError only when never confirmed — drives ERROR_RETAIN_FEED, not /haber.
      capabilityErrorRef.current = Boolean(transportError && !nextSession.confirmedEnabled)

      const id = meta?.identityDebug
      const grantMatch =
        typeof id?.currentMatchesActiveFeedReaderGrant === 'boolean'
          ? id.currentMatchesActiveFeedReaderGrant
          : null
      const uidMatch = resolveGrantBackedPilotMatch({
        currentMatchesActiveFeedReaderGrant: grantMatch,
        capabilityReady: true,
        capabilityEnabled: effectiveEnabled,
        authenticated,
      })
      patchReaderDebug({
        capabilityRequestFinished: true,
        capabilityEnabled: effectiveEnabled,
        capabilityReady: Boolean(ready),
        capabilityHTTPStatus: meta?.httpStatus ?? null,
        capabilityErrorCode: meta?.errorCode ?? null,
        globalDefault: meta?.globalDefault ?? null,
        capabilityAuthenticated:
          typeof meta?.serverAuthenticated === 'boolean'
            ? meta.serverAuthenticated
            : typeof meta?.clientAuthenticated === 'boolean'
              ? meta.clientAuthenticated
              : null,
        uidMatch,
        currentMatchesActiveFeedReaderGrant: grantMatch ?? (authenticated ? effectiveEnabled : null),
        ...(id
          ? {
              currentUidPresent: id.currentUidPresent,
              historicalGoogleCandidateExists: id.historicalGoogleCandidateExists,
              historicalGoogleCandidateProvider: id.historicalGoogleCandidateProvider,
              currentMatchesHistoricalGooglePilot: id.currentMatchesHistoricalGooglePilot,
              currentMatchesProgrammaticOperator: id.currentMatchesProgrammaticOperator,
              currentProviderType: id.currentProviderType,
              currentFirebaseRecordValid: id.currentFirebaseRecordValid,
              currentDisabled: id.currentDisabled,
              currentProfileExists: id.currentProfileExists,
              currentTermsAccepted: id.currentTermsAccepted,
              historicalProviderStillGoogleLinked: id.historicalProviderStillGoogleLinked,
              historicalCandidateDisabled: id.historicalCandidateDisabled,
            }
          : {}),
      })
    },
    [patchReaderDebug]
  )

  /**
   * Wait for AuthProvider (incl. deferred /feed-v2 bootstrap) before settling capability.
   * Unauthenticated `enabled=false` must not stick across later Firebase hydration.
   */
  useEffect(() => {
    patchReaderDebug({
      authLoading,
      authenticated: Boolean(authUser?.uid),
      // Grant-backed pilotMatch settles in applyFeedReaderCapability; clear while loading.
      ...(authLoading
        ? { uidMatch: false, currentMatchesActiveFeedReaderGrant: null }
        : {}),
    })

    if (authLoading) {
      // Preserve authoritative ENABLED latch across auth flicker — do not detach gestures.
      if (capabilitySessionRef.current.confirmedEnabled) {
        const kept = settleFeedReaderCapabilitySession(capabilitySessionRef.current, {
          authLoading: true,
          authenticated: Boolean(authUser?.uid),
          ready: false,
          enabled: true,
          transportError: false,
        })
        capabilitySessionRef.current = kept
        const keepEnabled = sessionReaderOpenEligible(kept)
        feedReaderEnabledRef.current = keepEnabled
        setFeedReaderEnabled(keepEnabled)
        readerCapabilityReadyRef.current = keepEnabled
        setReaderCapabilityReady(keepEnabled)
        capabilityErrorRef.current = false
        patchReaderDebug({ capabilityReady: keepEnabled, capabilityEnabled: keepEnabled })
        return
      }
      readerCapabilityReadyRef.current = false
      setReaderCapabilityReady(false)
      patchReaderDebug({ capabilityReady: false })
      return
    }

    readerCapabilityAbortRef.current?.abort()
    const ac = new AbortController()
    readerCapabilityAbortRef.current = ac
    const generation = ++readerCapabilityGenerationRef.current

    patchReaderDebug({
      capabilityRequestStarted: true,
      capabilityRequestFinished: false,
      capabilityErrorCode: null,
    })

    ;(async () => {
      try {
        let result = await fetchFeedReaderCapability({
          signal: ac.signal,
          readerDebug: readerDebugQuery,
        })
        // AuthProvider may already have uid while ID token is momentarily unavailable.
        if (!ac.signal.aborted && authUser?.uid && !result.authenticated) {
          result = await fetchFeedReaderCapability({
            signal: ac.signal,
            forceAuthRefresh: true,
            readerDebug: readerDebugQuery,
          })
        }
        if (ac.signal.aborted) return
        if (!isCapabilityGenerationCurrent(generation, readerCapabilityGenerationRef.current)) return
        applyFeedReaderCapability(result.enabled, {
          httpStatus: result.httpStatus,
          errorCode: result.errorCode,
          globalDefault: result.globalDefault,
          serverAuthenticated: result.serverAuthenticated,
          clientAuthenticated: result.authenticated,
          identityDebug: result.identityDebug,
        })
      } catch (err) {
        if (ac.signal.aborted) return
        if (!isCapabilityGenerationCurrent(generation, readerCapabilityGenerationRef.current)) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        applyFeedReaderCapability(false, {
          httpStatus: null,
          errorCode: 'fetch_error',
          error: true,
        })
      }
    })()

    return () => {
      ac.abort()
    }
  }, [authLoading, authUser?.uid, applyFeedReaderCapability, patchReaderDebug, readerDebugQuery])

  useEffect(() => {
    patchReaderDebug({
      readerItemSet: Boolean(readerItem),
      readerOverlayMounted: Boolean(readerItem),
    })
  }, [readerItem, patchReaderDebug])

  const resolveFeedReaderEnabledForOpen = useCallback(async (): Promise<boolean> => {
    // Session latch wins: confirmed ENABLED survives pending/transient blips.
    if (capabilitySessionRef.current.confirmedEnabled) {
      feedReaderEnabledRef.current = true
      return true
    }
    if (readerCapabilityReadyRef.current) return feedReaderEnabledRef.current
    if (authLoading) {
      toast.error('Oturum hazırlanıyor, tekrar deneyin')
      return false
    }
    try {
      patchReaderDebug({ capabilityRequestStarted: true })
      let result = await fetchFeedReaderCapability({ readerDebug: readerDebugQuery })
      if (authUser?.uid && !result.authenticated) {
        result = await fetchFeedReaderCapability({
          forceAuthRefresh: true,
          readerDebug: readerDebugQuery,
        })
      }
      // Do not clobber a newer effect settle; only fill if still pending.
      if (!readerCapabilityReadyRef.current && !capabilitySessionRef.current.confirmedEnabled) {
        applyFeedReaderCapability(result.enabled, {
          httpStatus: result.httpStatus,
          errorCode: result.errorCode,
          globalDefault: result.globalDefault,
          serverAuthenticated: result.serverAuthenticated,
          clientAuthenticated: result.authenticated,
          identityDebug: result.identityDebug,
        })
      }
      return feedReaderEnabledRef.current || capabilitySessionRef.current.confirmedEnabled
    } catch {
      if (!capabilitySessionRef.current.confirmedEnabled) {
        applyFeedReaderCapability(false, { errorCode: 'fetch_error', error: true })
      }
      return feedReaderEnabledRef.current || capabilitySessionRef.current.confirmedEnabled
    }
  }, [authLoading, authUser?.uid, applyFeedReaderCapability, patchReaderDebug, readerDebugQuery])

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
      targetCategory?: string | null,
      quiet = false
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
      else if (!quiet) {
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
        const quietKeepId =
          !append && quiet ? itemsRef.current[activeIndexRef.current]?.articleId ?? null : null
        const base = append ? itemsRef.current : []
        const merged = [...base]
        for (const item of acceptedIncoming) {
          if (merged.some((existing) => feedItemsOverlap(existing, item))) continue
          merged.push(item)
        }
        const quietMiss =
          Boolean(quiet && restoreAppliedRef.current && quietKeepId) &&
          !merged.some((i) => i.articleId === quietKeepId)
        // Stale-while-revalidate: if active card vanished from fresh page, keep snapshot.
        if (quietMiss) {
          setCursor(lastPage.nextCursor)
          cursorRef.current = lastPage.nextCursor
          setHasMore(Boolean(lastPage.hasMore && lastPage.nextCursor))
          hasMoreRef.current = Boolean(lastPage.hasMore && lastPage.nextCursor)
          return
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
          if (quiet && restoreAppliedRef.current) {
            if (quietKeepId) {
              const idx = merged.findIndex((i) => i.articleId === quietKeepId)
              if (idx >= 0) {
                setActiveIndex(idx)
                activeIndexRef.current = idx
                pendingRestoreScrollRef.current = idx
              }
            }
          } else {
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
      const pending = consumePendingFeedRestore(
        authLoading ? undefined : { userKey: authUser?.uid ?? 'guest' }
      )
      if (pending) {
        restoreAppliedRef.current = true
        personalizedOnceRef.current = true
        setMode(pending.mode)
        if (pending.category !== undefined) setCategory(pending.category ?? null)
        setActiveTabId(
          parseFeedV2TabFromSearch({
            mode: pending.mode,
            category: pending.category ?? null,
          }).tabId
        )
        setItems(pending.items ?? [])
        setCursor(pending.cursor ?? null)
        cursorRef.current = pending.cursor ?? null
        setHasMore(pending.hasMore ?? true)
        hasMoreRef.current = pending.hasMore ?? true
        setActiveIndex(pending.scrollIndex)
        activeIndexRef.current = pending.scrollIndex
        pendingRestoreScrollRef.current = pending.scrollIndex
        impressedArticleIdsRef.current = new Set(pending.impressedArticleIds ?? [])
        setLoading(false)
        clearFeedRestore()
        // Background revalidate without blocking warm first paint / yanking to card 0.
        window.setTimeout(() => {
          void loadPage(false, null, pending.mode, false, pending.category ?? null, true)
        }, 0)
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
    const top = el.getBoundingClientRect().top
    // iOS Safari: prefer visualViewport (toolbar-aware) over 100dvh CSS shell.
    // Mismatch (dvh shell > measured cards) peeks the next card under the publisher row.
    const vvH =
      typeof window !== 'undefined'
        ? Math.round(window.visualViewport?.height ?? window.innerHeight)
        : 0
    const innerH = typeof window !== 'undefined' ? Math.round(window.innerHeight) : 0
    const layoutH = vvH > 0 ? Math.min(vvH, innerH || vvH) : innerH
    const measured = Math.max(0, Math.round(layoutH - top))
    if (measured <= 0) return
    const prev = cardHeightRef.current
    cardHeightRef.current = measured
    el.style.setProperty('--feed-card-h', `${measured}px`)
    // Keep immersive shell the same unit as cards (prevents next-card bleed).
    const shell = el.closest('.content-main-reels') as HTMLElement | null
    if (shell) {
      shell.style.setProperty('--feed-card-h', `${measured}px`)
      shell.style.height = `${measured}px`
      shell.style.minHeight = `${measured}px`
      shell.style.maxHeight = `${measured}px`
    }
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--feed-card-h', `${measured}px`)
    }
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
      if (impressedArticleIdsRef.current.has(item.articleId)) return
      impressedArticleIdsRef.current.add(item.articleId)
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

  const clearReaderOpenRamp = useCallback(() => {
    if (readerOpenRampRef.current != null) {
      window.clearTimeout(readerOpenRampRef.current)
      readerOpenRampRef.current = null
    }
    readerCancelGenRef.current += 1
  }, [])

  const openReader = useCallback(
    (item: FeedItemDto, index: number, opts?: { fromProgress?: number; skipRamp?: boolean; openSource?: 'swipe' | 'swipe_affordance' | 'haberi_oku' | 'unknown' }) => {
      // Exactly one commit per article open — ignore double Haberi Oku / duplicate gesture commit.
      if (readerOpenGuardRef.current === item.articleId) {
        // Allow gesture skipRamp to promote an in-progress Haberi Oku ramp to committed once.
        if (!(opts?.skipRamp && readerSession?.item.articleId === item.articleId && !readerSession.committed)) {
          feedGestureCommitLockRef.current = null
          pushSwipeLifecycle('FEED_OPEN_FAIL')
          pushSwipeLifecycle('CANCEL_REASON=open_guard_blocked')
          recordReaderNavTrace({
            type: 'open_guard_blocked',
            pathname: '/feed-v2',
            search: typeof window !== 'undefined' ? window.location.search : '',
            historyLength: typeof window !== 'undefined' ? window.history.length : 0,
            readerOpenId: null,
            feedSessionId: feedSessionIdRef.current,
            readerMounted: Boolean(readerSession?.committed),
            feedMounted: true,
            readerState: readerSession?.committed ? 'open' : 'closed',
            openSource: opts?.openSource ?? (opts?.skipRamp ? 'swipe' : 'haberi_oku'),
            articleId: item.articleId,
            articleSlug: item.slug,
            feedIndex: index,
            guardArticleId: readerOpenGuardRef.current,
            mode,
            category,
            source: 'feed',
          })
          return
        }
      }

      const from = Math.min(1, Math.max(0, opts?.fromProgress ?? 0))
      const reduced = prefersReducedMotion()
      const openSource = opts?.openSource ?? (opts?.skipRamp ? 'swipe' : 'haberi_oku')

      if (opts?.skipRamp || from >= 0.92 || reduced) {
        clearReaderOpenRamp()
        readerOpenGuardRef.current = item.articleId
        recordReaderNavTrace({
          type: 'gesture_accepted',
          pathname: '/feed-v2',
          search: typeof window !== 'undefined' ? window.location.search : '',
          historyLength: typeof window !== 'undefined' ? window.history.length : 0,
          readerOpenId: null,
          feedSessionId: feedSessionIdRef.current,
          readerMounted: true,
          feedMounted: true,
          readerState: 'open',
          openSource,
          articleId: item.articleId,
          feedIndex: index,
          mode,
          category,
        })
        const prevId = readerSession?.item.articleId
        if (prevId && prevId !== item.articleId) {
          pushSwipeLifecycle(`UNMOUNT_READER:${prevId}`)
        }
        readerGenerationRef.current += 1
        const generation = readerGenerationRef.current
        pushSwipeLifecycle(`MOUNT_READER:${item.articleId}`)
        setReaderSession({
          item,
          index,
          progress: 1,
          committed: true,
          progressAnimating: false,
          generation,
          openSource,
        })
        if (typeof document !== 'undefined') {
          document.documentElement.classList.add('smart-feed-reader-open')
          document.body.classList.add('smart-feed-reader-open')
        }
        if (openSource === 'swipe' || openSource === 'swipe_affordance') markSwipeDiscoveryLearned()
        patchReaderDebug({
          openReaderCalled: true,
          readerOpenRequested: true,
          readerItemSet: true,
          readerComponentRendered: true,
          readerOverlayMounted: true,
          readerUnmountReason: null,
          currentPath: 'FEED',
          routerPushCanonicalCalled: false,
        })
        return
      }

      // Haberi Oku / button: same page-turn authority as swipe (progress 0 → 1, then commit).
      clearReaderOpenRamp()
      readerOpenGuardRef.current = item.articleId
      recordReaderNavTrace({
        type: 'gesture_accepted',
        pathname: '/feed-v2',
        search: typeof window !== 'undefined' ? window.location.search : '',
        historyLength: typeof window !== 'undefined' ? window.history.length : 0,
        readerOpenId: null,
        feedSessionId: feedSessionIdRef.current,
        readerMounted: true,
        feedMounted: true,
        readerState: 'closed',
        openSource,
        articleId: item.articleId,
        feedIndex: index,
        mode,
        category,
      })
      // Mount off-screen at `from` with transition armed, then drive to 1.
      // progressAnimating must be true on first paint so FeedArticleReader does
      // not return null at progress≈0 (that caused iOS Haberi Oku hard-cuts).
      // Lock chrome before first paint — Reader mount effect is one frame later.
      if (typeof document !== 'undefined') {
        document.documentElement.classList.add('smart-feed-reader-open')
        document.body.classList.add('smart-feed-reader-open')
      }
      {
        const prevId = readerSession?.item.articleId
        if (prevId && prevId !== item.articleId) {
          pushSwipeLifecycle(`UNMOUNT_READER:${prevId}`)
        }
        readerGenerationRef.current += 1
        const generation = readerGenerationRef.current
        pushSwipeLifecycle(`MOUNT_READER:${item.articleId}`)
        setReaderSession({
          item,
          index,
          progress: from,
          committed: false,
          progressAnimating: true,
          generation,
          openSource,
        })
      }
      const runOpenAnim = () => {
        setReaderSession((s) =>
          s && s.item.articleId === item.articleId ? { ...s, progress: 1 } : s
        )
        readerOpenRampRef.current = window.setTimeout(() => {
          readerOpenRampRef.current = null
          setReaderSession((s) => {
            if (!s || s.item.articleId !== item.articleId) return s
            if (s.committed) return s
            return { ...s, progress: 1, committed: true, progressAnimating: false }
          })
        }, FEED_READER_DURATION_MS)
      }
      // Double-rAF after mount at `from` so WebKit paints translate(-100%) before 0→1.
      requestAnimationFrame(() => requestAnimationFrame(runOpenAnim))
      patchReaderDebug({
        openReaderCalled: true,
        readerOpenRequested: true,
        readerItemSet: true,
        readerComponentRendered: true,
        readerOverlayMounted: true,
        readerUnmountReason: null,
        currentPath: 'FEED',
        routerPushCanonicalCalled: false,
      })
    },
    [clearReaderOpenRamp, patchReaderDebug, pushSwipeLifecycle, readerSession]
  )

  // Pilot diagnostic only: whether open-gesture handlers are currently attachable.
  useEffect(() => {
    if (!showReaderDebug) return
    patchReaderDebug({
      gestureHandlerAttached: Boolean(!readerSession?.committed),
    })
  }, [showReaderDebug, readerSession?.committed, patchReaderDebug])

  const onRead = (
    item: FeedItemDto,
    index: number,
    action: 'button' | 'gesture' | 'swipe_affordance' = 'button'
  ) => {
    void (async () => {
      // Feed V3: Haberi Oku / up affordance / up swipe → bottom sheet (stay on feed).
      if (sheetMode) {
        const guestSeen = readGuestSeen()
        for (const key of feedItemIdentityKeys(item)) guestSeen.add(key)
        writeGuestSeen(guestSeen)
        clearReaderOpenRamp()
        setReaderSession(null)
        setSheetArticle({ item, index })
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
                source: 'feed_v3_sheet',
                openAction: action,
              },
            },
          ],
        })
        return
      }

      // Durable consumed: guest localStorage + server article_opened (not qualified impression).
      const guestSeen = readGuestSeen()
      for (const key of feedItemIdentityKeys(item)) guestSeen.add(key)
      writeGuestSeen(guestSeen)

      const enabled = await resolveFeedReaderEnabledForOpen()
      const sessionConfirmed = capabilitySessionRef.current.confirmedEnabled
      const decided = decideFeedReadAction({
        authLoading,
        capabilityReady: readerCapabilityReadyRef.current || sessionConfirmed,
        capabilityEnabled: enabled || sessionConfirmed,
        capabilityError: capabilityErrorRef.current && !sessionConfirmed,
        sessionConfirmedEnabled: sessionConfirmed,
      })
      const clickDebug = mapClickDebugFromDecision({ decision: decided.decision })

      patchReaderDebug({
        onReadCalled: true,
        lastReadClick: true,
        lastReadAction: action,
        lastReadArticleSlug: item.slug,
        lastReadDecision: decided.decision,
        lastFallbackReason: decided.fallbackReason,
        capabilityAtClick: clickDebug.capabilityAtClick,
        readDecision: clickDebug.readDecision,
        capabilityEnabled: enabled || sessionConfirmed,
        capabilityReady: readerCapabilityReadyRef.current || sessionConfirmed,
        authLoading,
        authenticated: Boolean(authUser?.uid),
        uidMatch: resolveGrantBackedPilotMatch({
          capabilityReady: readerCapabilityReadyRef.current || sessionConfirmed,
          capabilityEnabled: enabled || sessionConfirmed,
          authenticated: Boolean(authUser?.uid),
        }),
        readerOpenRequested: decided.decision === 'OPEN_READER',
        openReaderCalled: false,
        routerPushCanonicalCalled: false,
        currentPath: 'FEED',
      })

      recordReaderNavTrace({
        type: 'read_decision',
        pathname: '/feed-v2',
        search: typeof window !== 'undefined' ? window.location.search : '',
        historyLength: typeof window !== 'undefined' ? window.history.length : 0,
        readerOpenId: null,
        feedSessionId: feedSessionIdRef.current,
        readerMounted: Boolean(readerSession?.committed),
        feedMounted: true,
        readerState: readerSession?.committed ? 'open' : 'closed',
        openSource:
          action === 'gesture' || action === 'swipe_affordance' ? 'swipe' : 'haberi_oku',
        articleId: item.articleId,
        articleSlug: item.slug,
        feedIndex: index,
        mode,
        category,
        readDecision: decided.decision,
        fallbackReason: decided.fallbackReason,
        capabilityEnabled: enabled || sessionConfirmed,
        capabilityReady: readerCapabilityReadyRef.current || sessionConfirmed,
        capabilityError: capabilityErrorRef.current && !sessionConfirmed,
        sessionConfirmedEnabled: sessionConfirmed,
        guardArticleId: readerOpenGuardRef.current,
        source: 'feed',
      })

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
              source:
                decided.decision === 'OPEN_READER' ? 'feed_reader' : 'news_detail',
            },
          },
        ],
      })

      if (decided.decision === 'OPEN_READER') {
        if (action === 'gesture' || action === 'swipe_affordance') {
          pushSwipeLifecycle('FEED_OPEN_PENDING')
          openReader(item, index, {
            fromProgress:
              readerSession?.item.articleId === item.articleId ? readerSession.progress : 1,
            skipRamp: true,
            openSource: action === 'swipe_affordance' ? 'swipe_affordance' : 'swipe',
          })
          feedGestureCommitLockRef.current = null
          pushSwipeLifecycle('READER_COMMITTED')
        } else {
          openReader(item, index)
          feedGestureCommitLockRef.current = null
        }
        return
      }

      // Capability still pending (auth hydrating) — never silent-fail on human tap/swipe.
      if (decided.decision === 'PENDING') {
        feedGestureCommitLockRef.current = null
        pushSwipeLifecycle('FEED_OPEN_FAIL')
        pushSwipeLifecycle('CANCEL_REASON=capability_pending')
        setFeedGestureEpoch((e) => e + 1)
        toast('Okuyucu hazırlanıyor, bir an sonra tekrar deneyin')
        return
      }

      // Transient capability failure — remain on Feed; never escape to /haber.
      if (
        decided.decision === 'ERROR_RETAIN_FEED' ||
        decided.decision === 'ERROR_FALLBACK'
      ) {
        feedGestureCommitLockRef.current = null
        pushSwipeLifecycle('FEED_OPEN_FAIL')
        pushSwipeLifecycle('CANCEL_REASON=capability_error')
        setFeedGestureEpoch((e) => e + 1)
        toast.error('Okuyucu şu an hazır değil, tekrar deneyin')
        return
      }

      // Authoritative CANONICAL_FALLBACK only (guest / denied pilot).
      feedGestureCommitLockRef.current = null
      pushSwipeLifecycle('FEED_OPEN_FAIL')
      pushSwipeLifecycle('CANCEL_REASON=canonical_fallback')
      setFeedGestureEpoch((e) => e + 1)
      const destination = ROUTES.NEWS_DETAIL(item.slug)
      recordReaderNavTrace({
        type: 'canonical_navigation',
        pathname: '/feed-v2',
        search: typeof window !== 'undefined' ? window.location.search : '',
        historyLength: typeof window !== 'undefined' ? window.history.length : 0,
        readerOpenId: null,
        feedSessionId: feedSessionIdRef.current,
        readerMounted: false,
        feedMounted: true,
        readerState: 'closed',
        openSource: action === 'gesture' ? 'swipe' : 'haberi_oku',
        articleId: item.articleId,
        articleSlug: item.slug,
        feedIndex: index,
        mode,
        category,
        readDecision: decided.decision,
        fallbackReason: decided.fallbackReason,
        capabilityEnabled: enabled || sessionConfirmed,
        capabilityReady: readerCapabilityReadyRef.current || sessionConfirmed,
        capabilityError: capabilityErrorRef.current && !sessionConfirmed,
        sessionConfirmedEnabled: sessionConfirmed,
        destination,
        source: 'feed',
      })
      clearReaderOpenRamp()
      readerOpenGuardRef.current = null
      setReaderSession(null)
      saveFeedRestore({
        mode,
        category,
        articleId: item.articleId,
        cursor,
        hasMore,
        scrollIndex: index,
        items,
        timestamp: Date.now(),
        pending: true,
        source: 'canonical',
        userKey: authUser?.uid ?? 'guest',
        impressedArticleIds: [...impressedArticleIdsRef.current],
      })
      patchReaderDebug({
        routerPushCanonicalCalled: true,
        currentPath: 'CANONICAL_ARTICLE',
        openReaderCalled: false,
        readerItemSet: false,
        readerOverlayMounted: false,
        readerComponentRendered: false,
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
      className="relative h-full min-h-0 w-full bg-black overflow-hidden flex justify-center select-none"
      data-testid="smart-feed-root"
      data-feed-mounted="1"
      data-feed-session-id={feedSessionIdRef.current}
    >
      {/* Canonical Viewport Shell — fills .content-main-reels (remaining band under chrome) */}
      <div
        className={cn(
          'relative h-full min-h-0 overflow-hidden bg-black flex flex-col',
          FEED_READER_SURFACE_CLASS
        )}
        style={FEED_V2_CHROME_CSS_VARS as CSSProperties}
        data-testid="smart-feed-canonical-shell"
        data-feed-surface="1"
      >
        {/* Top category navigation — Always mounted */}
        <FeedV2CategoryNav
          activeTabId={activeTabId}
          onChange={handleTabChange}
          exitHidden={Boolean(readerSession && readerSession.progress > 0.15)}
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
          <div className="h-full min-h-0 w-full overflow-hidden" data-testid="smart-feed-skeleton-view">
            <FullscreenNewsCardSkeleton />
          </div>
        ) : errorState ? (
          /* Error / Auth Required / Pilot Preview State */
          <div
            className="flex h-full min-h-0 w-full flex-col items-center justify-center px-6 text-center text-white/80"
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
            className="flex h-full min-h-0 w-full flex-col items-center justify-center px-6 text-center text-white/80"
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
              'h-full min-h-0 w-full snap-y snap-mandatory overflow-y-scroll transition-opacity duration-200',
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
                  onReadClick={() => onRead(item, index, 'button')}
                  onCategoryClick={
                    resolveFeedV2TabForArticleCategory(item.category)
                      ? () => {
                          const tab = resolveFeedV2TabForArticleCategory(item.category)
                          if (tab) handleTabChange(tab)
                        }
                      : undefined
                  }
                  onImpression={() => recordImpression(item)}
                  onOpenReaderGesture={
                    !sheetMode && isActive && !readerSession?.committed
                      ? (g) => {
                          if (showReaderDebug) {
                            const classified = classifyFeedOpenGestureDecision(g)
                            patchReaderDebug({
                              gestureDx: Math.round(g.dx),
                              gestureDy: Math.round(g.dy),
                              gestureAxis: classified.axis,
                              gestureQualified: classified.qualified,
                              gestureDecision: classified.decision,
                            })
                          }
                          dispatchFeedOpenGesture({
                            ...g,
                            onOpen: () => {
                              feedGestureCommitLockRef.current = item.articleId
                              pushSwipeLifecycle('FEED_GESTURE_COMMIT')
                              if (showSwipeEventHud) {
                                setSwipeHud((prev) => ({
                                  ...prev,
                                  lastAction: 'OPEN_READER',
                                  commitLock: true,
                                  lifecycle: formatSwipeLifecycleRing(swipeLifecycleRef.current),
                                }))
                              }
                              onRead(item, index, 'gesture')
                            },
                          })
                        }
                      : undefined
                  }
                  onOpenSheetGesture={
                    sheetMode && isActive && !sheetArticle
                      ? () => onRead(item, index, 'gesture')
                      : undefined
                  }
                  onOpenReaderProgress={
                    !sheetMode && isActive && !readerSession?.committed
                      ? (progress) => {
                          clearReaderOpenRamp()
                          setReaderSession((s) => {
                            if (s?.committed) return s
                            if (!s || s.item.articleId !== item.articleId) {
                              if (s?.item.articleId) {
                                pushSwipeLifecycle(`UNMOUNT_READER:${s.item.articleId}`)
                              }
                              readerGenerationRef.current += 1
                              const generation = readerGenerationRef.current
                              pushSwipeLifecycle('READER_SESSION_CREATE')
                              pushSwipeLifecycle(`MOUNT_READER:${item.articleId}`)
                              return {
                                item,
                                index,
                                progress,
                                committed: false,
                                progressAnimating: false,
                                generation,
                                openSource: 'swipe',
                              }
                            }
                            return { ...s, progress, progressAnimating: false }
                          })
                        }
                      : undefined
                  }
                  onOpenReaderCancel={
                    !sheetMode && isActive && !readerSession?.committed
                      ? () => {
                          if (
                            shouldIgnoreFeedOpenCancel({
                              commitLockArticleId: feedGestureCommitLockRef.current,
                              articleId: item.articleId,
                            })
                          ) {
                            pushSwipeLifecycle('FEED_GESTURE_CANCEL_IGNORED_COMMIT_LOCK')
                            return
                          }
                          pushSwipeLifecycle('FEED_GESTURE_CANCEL')
                          pushSwipeLifecycle('CANCEL_REASON=feed_pointer_cancel_or_vertical')
                          const gen = ++readerCancelGenRef.current
                          if (readerOpenRampRef.current != null) {
                            window.clearTimeout(readerOpenRampRef.current)
                            readerOpenRampRef.current = null
                          }
                          // Preview cancel is not a committed open — release guard for this card.
                          if (readerOpenGuardRef.current === item.articleId) {
                            readerOpenGuardRef.current = null
                          }
                          setReaderSession((s) => {
                            if (!s || s.committed) return s
                            if (s.item.articleId !== item.articleId) return s
                            return { ...s, progress: 0, progressAnimating: true }
                          })
                          window.setTimeout(() => {
                            if (gen !== readerCancelGenRef.current) return
                            setReaderSession((s) => {
                              if (
                                s &&
                                !s.committed &&
                                s.item.articleId === item.articleId &&
                                s.progress <= 0.02
                              ) {
                                pushSwipeLifecycle(`UNMOUNT_READER:${s.item.articleId}`)
                                return null
                              }
                              return s
                            })
                            setFeedGestureEpoch((e) => e + 1)
                            pushSwipeLifecycle('FEED_GESTURE_EPOCH_BUMP')
                          }, FEED_READER_DURATION_MS)
                        }
                      : undefined
                  }
                  feedGestureEpoch={feedGestureEpoch}
                  onGesturePointerDebug={
                    showReaderDebug || showSwipeEventHud
                      ? (ev) => {
                          if (showReaderDebug) {
                            if (ev.phase === 'down') {
                              patchReaderDebug({
                                pointerDownReceived: true,
                                pointerMoveReceived: false,
                                pointerUpReceived: false,
                                pointerCancelReceived: false,
                                gestureDecision: ev.ignoredInteractive
                                  ? 'IGNORED_INTERACTIVE'
                                  : ev.handlerAbsent
                                    ? 'HANDLER_ABSENT'
                                    : null,
                                gestureDx: null,
                                gestureDy: null,
                                gestureAxis: null,
                                gestureQualified: false,
                                onReadCalled: false,
                                readerOpenRequested: false,
                              })
                            } else if (ev.phase === 'move') {
                              patchReaderDebug({
                                pointerMoveReceived: true,
                                gestureDx:
                                  typeof ev.dx === 'number' ? Math.round(ev.dx) : null,
                                gestureDy:
                                  typeof ev.dy === 'number' ? Math.round(ev.dy) : null,
                              })
                            } else if (ev.phase === 'up') {
                              patchReaderDebug({ pointerUpReceived: true })
                            } else {
                              patchReaderDebug({
                                pointerCancelReceived: true,
                                gestureDecision: 'CANCELLED',
                                gestureQualified: false,
                              })
                            }
                          }
                          if (!showSwipeEventHud) return
                          const phaseUpper =
                            ev.phase === 'down'
                              ? 'DOWN'
                              : ev.phase === 'move'
                                ? 'MOVE'
                                : ev.phase === 'up'
                                  ? 'UP'
                                  : 'CANCEL'
                          setSwipeHud((prev) => {
                            const dx = typeof ev.dx === 'number' ? ev.dx : prev.dx
                            const dy = typeof ev.dy === 'number' ? ev.dy : prev.dy
                            return {
                              event: phaseUpper,
                              pointerType: ev.pointerType ?? prev.pointerType,
                              startX: ev.startX ?? prev.startX,
                              currentX: ev.currentX ?? prev.currentX,
                              dx,
                              startY: ev.startY ?? prev.startY,
                              currentY: ev.currentY ?? prev.currentY,
                              dy,
                              owner: ev.owner ?? prev.owner,
                              directionValid: Boolean(ev.directionValid),
                              dominance:
                                typeof ev.dominance === 'number' ? ev.dominance : prev.dominance,
                              activated: Boolean(ev.activated),
                              captured: Boolean(ev.captured),
                              progress:
                                typeof ev.progress === 'number' ? ev.progress : prev.progress,
                              reducedMotion: Boolean(ev.reducedMotion ?? prev.reducedMotion),
                              targetTag: ev.targetTag ?? prev.targetTag,
                              interactiveTarget: Boolean(ev.ignoredInteractive),
                              touchAction: ev.touchAction ?? prev.touchAction,
                              lastAction: ev.lastAction ?? prev.lastAction,
                              sequence: appendSwipeEventSequence(prev.sequence, phaseUpper),
                              moveCount:
                                ev.phase === 'down'
                                  ? 0
                                  : ev.phase === 'move'
                                    ? prev.moveCount + 1
                                    : prev.moveCount,
                              lifecycle: prev.lifecycle,
                              commitLock: Boolean(feedGestureCommitLockRef.current),
                              gestureEpoch: feedGestureEpoch,
                            }
                          })
                        }
                      : undefined
                  }
                  showDiscoveryRail={(index + 1) % 8 === 0 && index < items.length - 1}
                  discoveryCategory={item.category ?? category}
                  discoveryExcludeIds={items.map((i) => i.articleId)}
                  onDiscoveryArticleOpen={(d) => {
                          // Always route through onRead — never bare /haber Link while
                          // capability is pending (transient flicker → newspaper surface).
                          // Guest/deny still reaches CANONICAL_FALLBACK via decideFeedReadAction.
                          const existing = items.find((i) => i.articleId === d.articleId)
                          if (existing) {
                            const idx = items.findIndex((i) => i.articleId === d.articleId)
                            onRead(existing, idx >= 0 ? idx : index, 'button')
                            return
                          }
                          const synthetic: FeedItemDto = {
                            id: d.articleId,
                            type: 'article',
                            articleId: d.articleId,
                            clusterId: null,
                            publisher: d.publisherName
                              ? {
                                  id: 'discovery',
                                  slug: 'discovery',
                                  name: d.publisherName,
                                  logoUrl: null,
                                }
                              : null,
                            headline: d.headline,
                            summary: null,
                            category: d.category,
                            image: d.image,
                            video: null,
                            publishedAt: d.publishedAt,
                            updatedAt: d.publishedAt,
                            breaking: false,
                            materialUpdate: false,
                            clusterSourceCount: 0,
                            socialState: null,
                            socialCounts: { likes: 0, comments: 0, saves: 0, shares: 0 },
                            reason: 'DISCOVERY',
                            slug: d.slug || d.articleId,
                          }
                          onRead(synthetic, index, 'button')
                        }}
                  showSwipeDiscoveryCoach={Boolean(
                    !sheetMode && isActive && !readerSession?.committed
                  )}
                  swipeDiscoverySuppressed={Boolean(
                    readerSession &&
                      readerSession.item.articleId === item.articleId &&
                      readerSession.progress > 0.02
                  )}
                  onSwipeAffordanceActivate={
                    !sheetMode && isActive && !readerSession?.committed
                      ? () => onRead(item, index, 'swipe_affordance')
                      : undefined
                  }
                  showSheetOpenCoach={Boolean(sheetMode && isActive && !sheetArticle)}
                  onSheetAffordanceActivate={
                    sheetMode && isActive && !sheetArticle
                      ? () => onRead(item, index, 'swipe_affordance')
                      : undefined
                  }
                  readerUnderlayProgress={
                    !sheetMode &&
                    readerSession &&
                    readerSession.item.articleId === item.articleId
                      ? readerSession.progress
                      : 0
                  }
                  readerUnderlayAnimating={Boolean(
                    !sheetMode &&
                      readerSession &&
                      readerSession.item.articleId === item.articleId &&
                      readerSession.progressAnimating
                  )}
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

        {sheetMode && sheetArticle ? (
          <FeedArticleBottomSheet
            item={sheetArticle.item}
            open
            onClose={() => {
              const idx = sheetArticle.index
              setSheetArticle(null)
              requestAnimationFrame(() => scrollToIndex(idx))
            }}
          />
        ) : null}

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

        {/*
          Mount while session exists — including progress≈0 with progressAnimating.
          Gating on progress>0.001 skipped the off-screen first paint, so Haberi Oku
          first mounted at progress=1 (hard cut, no page-turn) on WebKit/iOS.
        */}
        {readerSession ? (
          <FeedArticleReader
            key={`reader-${readerSession.generation}`}
            item={readerSession.item}
            committed={readerSession.committed}
            visualProgress={readerSession.progress}
            progressAnimating={readerSession.progressAnimating}
            feedSessionId={feedSessionIdRef.current}
            openSource={readerSession.openSource ?? 'unknown'}
            onVisualProgress={(progress, opts) => {
              setReaderSession((s) => {
                if (!s || s.generation !== readerSession.generation) return s
                return {
                  ...s,
                  progress,
                  progressAnimating: opts?.animating ?? s.progressAnimating,
                }
              })
            }}
            onClose={() => {
              const idx = readerSession.index
              const closedId = readerSession.item.articleId
              clearReaderOpenRamp()
              feedGestureCommitLockRef.current = null
              readerOpenGuardRef.current = null
              setReaderSession(null)
              setFeedGestureEpoch((e) => e + 1)
              pushSwipeLifecycle('READER_CLOSE_FINISH')
              pushSwipeLifecycle(`UNMOUNT_READER:${closedId}`)
              pushSwipeLifecycle('READER_SESSION_CLEAR')
              pushSwipeLifecycle('FEED_GESTURE_EPOCH_BUMP')
              patchReaderDebug({
                readerItemSet: false,
                readerOverlayMounted: false,
                readerComponentRendered: false,
                readerBodyRequestStarted: false,
                readerBodyHTTPStatus: null,
                readerBodyErrorCode: null,
                readerUnmountReason: 'user_close',
                currentPath: 'FEED',
              })
              // Stay on same card index — Feed never unmounted.
              requestAnimationFrame(() => scrollToIndex(idx))
            }}
            onCloseTelemetry={onReaderCloseTelemetry}
            onBodyDebug={
              showReaderDebug
                ? (body) => {
                    patchReaderDebug({
                      readerBodyRequestStarted: body.started,
                      readerBodyHTTPStatus: body.httpStatus,
                      readerBodyErrorCode: body.errorCode,
                    })
                  }
                : undefined
            }
            liked={
              social[readerSession.item.articleId]?.liked ??
              readerSession.item.socialState?.liked ??
              false
            }
            saved={
              social[readerSession.item.articleId]?.saved ??
              readerSession.item.socialState?.saved ??
              false
            }
            likeCount={
              social[readerSession.item.articleId]?.likeCount ??
              readerSession.item.socialCounts.likes ??
              0
            }
            commentCount={
              social[readerSession.item.articleId]?.commentCount ??
              readerSession.item.socialCounts.comments ??
              0
            }
            saveCount={
              social[readerSession.item.articleId]?.saveCount ??
              readerSession.item.socialCounts.saves ??
              0
            }
            onToggleLike={() => void toggleLike(readerSession.item)}
            onToggleSave={() => void toggleSave(readerSession.item)}
            onCommentClick={() => setCommentArticleId(readerSession.item.articleId)}
            onLockFeedScroll={setFeedScrollLocked}
          />
        ) : null}

        {showReaderDebug ? (
          // Collapsed marker for legacy source contracts / TRACE chip pairing.
          <div
            data-testid="feed-reader-debug-panel"
            data-reader-debug-collapsed="1"
            className="pointer-events-none fixed left-0 top-0 z-[200] h-0 w-0 overflow-hidden opacity-0"
            aria-hidden
          >
            {buildFeedReaderDebugBadgeLines(readerDebug).join('\n')}
          </div>
        ) : null}

        {showSwipeEventHud ? (
          <div
            data-testid="feed-swipe-event-hud"
            data-swipe-hud="1"
            className="pointer-events-none fixed bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] left-1 right-1 z-[220] max-h-[38vh] overflow-hidden rounded-lg bg-black/78 px-2 py-1.5 font-mono text-[10px] leading-[1.35] text-lime-300 shadow-lg ring-1 ring-lime-500/30"
            aria-hidden
          >
            {formatSwipeEventHudLines(swipeHud, {
              readerSession: readerSession
                ? readerSession.committed
                  ? 'open'
                  : 'opening'
                : 'none',
              readerProgress: readerSession?.progress ?? 0,
              readerGeneration: readerSession?.generation ?? null,
              readerArticleId: readerSession?.item.articleId ?? null,
              capability: readerDebug.capabilityReady
                ? readerDebug.capabilityEnabled
                  ? 'READY'
                  : 'OFF'
                : readerDebug.capabilityErrorCode
                  ? 'ERROR'
                  : 'PENDING',
            }).map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
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
  onCategoryClick?: () => void
  onImpression: () => void
  onOpenReaderGesture?: (g: {
    dx: number
    dy: number
    startClientX: number
    viewportWidth: number
    velocityX: number
  }) => void
  /** Feed V3: upward swipe completes → open article sheet. */
  onOpenSheetGesture?: () => void
  /** Interactive page-turn: report progress during drag (before release). */
  onOpenReaderProgress?: (progress: number) => void
  /** Snap-back / cancel — clear uncommitted Reader preview. */
  onOpenReaderCancel?: () => void
  /** Pilot swipe HUD only — pointer delivery forensic; no engagement writes. */
  onGesturePointerDebug?: (ev: {
    phase: 'down' | 'move' | 'up' | 'cancel'
    ignoredInteractive?: boolean
    handlerAbsent?: boolean
    pointerType?: string
    startX?: number
    currentX?: number
    startY?: number
    currentY?: number
    dx?: number
    dy?: number
    owner?: import('@/lib/feed/reader/swipeEventHud').SwipeHudOwner
    directionValid?: boolean
    dominance?: number | null
    activated?: boolean
    captured?: boolean
    progress?: number
    reducedMotion?: boolean
    targetTag?: string | null
    touchAction?: string | null
    lastAction?: import('@/lib/feed/reader/swipeEventHud').SwipeHudLastAction
  }) => void
  showDiscoveryRail?: boolean
  discoveryCategory?: string | null
  discoveryExcludeIds?: string[]
  onDiscoveryArticleOpen?: (item: {
    articleId: string
    slug: string
    headline: string
    image: string | null
    category: string | null
    publishedAt: string
    publisherName?: string | null
  }) => void
  showSwipeDiscoveryCoach?: boolean
  swipeDiscoverySuppressed?: boolean
  onSwipeAffordanceActivate?: () => void
  showSheetOpenCoach?: boolean
  onSheetAffordanceActivate?: () => void
  /** Haberi Oku / committed open progress — drives Feed underlay page-turn. */
  readerUnderlayProgress?: number
  /** Keep underlay CSS transition armed while progress animates to 0 on close. */
  readerUnderlayAnimating?: boolean
  /** Bumped after Reader close / failed open — reset stale drag listeners. */
  feedGestureEpoch?: number
}) {
  const {
    onOpenReaderGesture,
    onOpenSheetGesture,
    onOpenReaderProgress,
    onOpenReaderCancel,
    onGesturePointerDebug,
    readerUnderlayProgress = 0,
    readerUnderlayAnimating = false,
    feedGestureEpoch = 0,
    ...cardProps
  } = props
  const impressionRef = useFeedImpressionRef(props.item.articleId, props.isActive, props.onImpression)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{
    pointerId: number
    x: number
    y: number
    lastX: number
    lastT: number
    axis: 'none' | 'horizontal' | 'vertical'
    moveListener: ((ev: PointerEvent) => void) | null
  } | null>(null)
  const peekTimerRef = useRef<number | null>(null)
  const peekArmedRef = useRef(false)
  const [dragProgress, setDragProgress] = useState(0)
  const [snapAnimating, setSnapAnimating] = useState(false)
  const [horizontalLocked, setHorizontalLocked] = useState(false)
  const reducedMotion = prefersReducedMotion()
  const pageProgress = Math.max(dragProgress, readerUnderlayProgress)

  const clearPeekTimer = () => {
    if (peekTimerRef.current != null) {
      window.clearTimeout(peekTimerRef.current)
      peekTimerRef.current = null
    }
  }

  const clearNativeMove = () => {
    const d = drag.current
    const el = surfaceRef.current
    if (d?.moveListener && el) {
      el.removeEventListener('pointermove', d.moveListener)
      d.moveListener = null
    }
  }

  const resetDragVisual = (animate: boolean) => {
    clearPeekTimer()
    peekArmedRef.current = false
    clearNativeMove()
    drag.current = null
    setHorizontalLocked(false)
    if (animate && !reducedMotion) {
      setSnapAnimating(true)
      setDragProgress(0)
      window.setTimeout(() => setSnapAnimating(false), FEED_READER_DURATION_MS)
    } else {
      setSnapAnimating(false)
      setDragProgress(0)
    }
  }

  // After Reader close / failed open: always return to CLEAN IDLE (stale capture/listener).
  useEffect(() => {
    resetDragVisual(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- epoch is the intentional reset signal
  }, [feedGestureEpoch])

  return (
    <div
      ref={surfaceRef}
      className="relative touch-pan-y will-change-transform"
      data-testid="smart-feed-card-gesture-surface"
      data-feed-open-touch-action="pan-y"
      style={{
        transform:
          reducedMotion || pageProgress <= 0
            ? undefined
            : `translate3d(${-pageProgress * 28}%, 0, 0) scale(${1 - pageProgress * 0.035})`,
        opacity: reducedMotion ? 1 : 1 - pageProgress * 0.18,
        transition:
          (snapAnimating || readerUnderlayProgress > 0 || readerUnderlayAnimating) &&
          !reducedMotion &&
          dragProgress <= 0.02
            ? `transform ${FEED_READER_DURATION_MS}ms ${FEED_READER_EASING}, opacity ${FEED_READER_DURATION_MS}ms ${FEED_READER_EASING}`
            : snapAnimating && !reducedMotion
              ? `transform ${FEED_READER_DURATION_MS}ms ${FEED_READER_EASING}, opacity ${FEED_READER_DURATION_MS}ms ${FEED_READER_EASING}`
              : 'none',
        // After horizontal lock: deny browser pan so pointercancel cannot abort open.
        touchAction: horizontalLocked ? 'none' : undefined,
        boxShadow:
          pageProgress > 0.08
            ? `-14px 0 28px rgba(0,0,0,${0.22 + pageProgress * 0.28})`
            : undefined,
        transformOrigin: 'left center',
        willChange: pageProgress > 0.01 ? 'transform, opacity' : undefined,
      }}
      onPointerDown={(e) => {
        const sheetOpen = Boolean(onOpenSheetGesture)
        const pageTurnOpen = Boolean(onOpenReaderGesture)
        if ((!sheetOpen && !pageTurnOpen) || !props.isActive) {
          onGesturePointerDebug?.({
            phase: 'down',
            handlerAbsent: !pageTurnOpen && !sheetOpen,
            pointerType: e.pointerType,
            startX: e.clientX,
            currentX: e.clientX,
            startY: e.clientY,
            currentY: e.clientY,
            dx: 0,
            dy: 0,
            owner: 'HANDLER_ABSENT',
            directionValid: false,
            activated: false,
            captured: false,
            progress: 0,
            reducedMotion,
            targetTag: targetTagName(e.target),
            touchAction: readTouchActionForTarget(e.target),
            lastAction: 'REJECT_HANDLER',
          })
          return
        }
        if (e.pointerType === 'mouse' && e.button !== 0) return
        if (shouldIgnoreFeedOpenGestureTarget(e.target)) {
          onGesturePointerDebug?.({
            phase: 'down',
            ignoredInteractive: true,
            pointerType: e.pointerType,
            startX: e.clientX,
            currentX: e.clientX,
            startY: e.clientY,
            currentY: e.clientY,
            dx: 0,
            dy: 0,
            owner: 'INTERACTIVE',
            directionValid: false,
            activated: false,
            captured: false,
            progress: 0,
            reducedMotion,
            targetTag: targetTagName(e.target),
            touchAction: readTouchActionForTarget(e.target),
            lastAction: 'REJECT_INTERACTIVE',
          })
          return
        }
        if (!sheetOpen && shouldIgnoreSystemBackEdge(e.clientX, window.innerWidth)) {
          onGesturePointerDebug?.({
            phase: 'down',
            pointerType: e.pointerType,
            startX: e.clientX,
            currentX: e.clientX,
            startY: e.clientY,
            currentY: e.clientY,
            dx: 0,
            dy: 0,
            owner: 'SYSTEM_EDGE',
            directionValid: false,
            activated: false,
            captured: false,
            progress: 0,
            reducedMotion,
            targetTag: targetTagName(e.target),
            touchAction: readTouchActionForTarget(e.target),
            lastAction: 'REJECT_EDGE',
          })
          recordReaderNavTrace({
            type: 'gesture_ignored_ios_edge',
            pathname: '/feed-v2',
            search: window.location.search,
            historyLength: window.history.length,
            readerOpenId: null,
            feedSessionId: null,
            readerMounted: false,
            feedMounted: true,
            readerState: 'closed',
            openSource: 'swipe',
            startClientX: e.clientX,
            viewportWidth: window.innerWidth,
            nearSystemBackEdge: true,
            source: 'feed',
          })
          return
        }
        onGesturePointerDebug?.({
          phase: 'down',
          pointerType: e.pointerType,
          startX: e.clientX,
          currentX: e.clientX,
          startY: e.clientY,
          currentY: e.clientY,
          dx: 0,
          dy: 0,
          owner: 'NONE',
          directionValid: false,
          activated: false,
          captured: false,
          progress: 0,
          reducedMotion,
          targetTag: targetTagName(e.target),
          touchAction: readTouchActionForTarget(e.target),
          lastAction: 'NONE',
        })
        // Always clear stale move listeners / capture before a new gesture (CLEAN IDLE).
        clearNativeMove()
        drag.current = null
        setSnapAnimating(false)
        setHorizontalLocked(false)
        const pointerId = e.pointerId
        const startX = e.clientX
        const startY = e.clientY
        const moveListener = (ev: PointerEvent) => {
          const d = drag.current
          if (!d || d.pointerId !== ev.pointerId) return
          const dx = ev.clientX - d.x
          const dy = ev.clientY - d.y
          if (d.axis === 'none') {
            const intent = classifyAxisIntent(dx, dy)
            if (sheetOpen) {
              // Feed V3: upward swipe opens sheet; downward/vertical feed scroll stays free.
              if (intent === 'horizontal') return
              if (intent !== 'vertical') return
              if (dy >= 0) return
              if (nestedFeedContentCanScroll(ev.target, dy)) {
                clearNativeMove()
                drag.current = null
                return
              }
              d.axis = 'vertical'
              try {
                surfaceRef.current?.setPointerCapture(ev.pointerId)
              } catch {
                // Non-fatal
              }
            } else {
              if (intent === 'vertical') {
                // Nested copy/CTA scroll owns vertical until its edge.
                if (nestedFeedContentCanScroll(ev.target, dy)) {
                  clearPeekTimer()
                  peekArmedRef.current = false
                  clearNativeMove()
                  drag.current = null
                  setHorizontalLocked(false)
                  setDragProgress(0)
                  onOpenReaderCancel?.()
                  onGesturePointerDebug?.({
                    phase: 'move',
                    pointerType: ev.pointerType,
                    startX: d.x,
                    currentX: ev.clientX,
                    startY: d.y,
                    currentY: ev.clientY,
                    dx,
                    dy,
                    owner: 'VERTICAL',
                    directionValid: false,
                    activated: false,
                    captured: false,
                    progress: 0,
                    reducedMotion,
                    dominance: Math.abs(dx) > 0 ? Math.abs(dx) / Math.max(1, Math.abs(dy)) : 0,
                    targetTag: targetTagName(ev.target),
                    touchAction: readTouchActionForTarget(ev.target),
                    lastAction: 'CANCEL',
                  })
                  return
                }
                clearPeekTimer()
                peekArmedRef.current = false
                clearNativeMove()
                drag.current = null
                setHorizontalLocked(false)
                setDragProgress(0)
                onOpenReaderCancel?.()
                onGesturePointerDebug?.({
                  phase: 'move',
                  pointerType: ev.pointerType,
                  startX: d.x,
                  currentX: ev.clientX,
                  startY: d.y,
                  currentY: ev.clientY,
                  dx,
                  dy,
                  owner: 'VERTICAL',
                  directionValid: false,
                  activated: false,
                  captured: false,
                  progress: 0,
                  reducedMotion,
                  dominance: Math.abs(dx) > 0 ? Math.abs(dx) / Math.max(1, Math.abs(dy)) : 0,
                  targetTag: targetTagName(ev.target),
                  touchAction: readTouchActionForTarget(ev.target),
                  lastAction: 'CANCEL',
                })
                return
              }
              if (intent !== 'horizontal') {
                // Still within activate band — keep peek timer unless movement escapes hold.
                if (!isStillHoldMovement(dx, dy)) {
                  clearPeekTimer()
                }
                onGesturePointerDebug?.({
                  phase: 'move',
                  pointerType: ev.pointerType,
                  startX: d.x,
                  currentX: ev.clientX,
                  startY: d.y,
                  currentY: ev.clientY,
                  dx,
                  dy,
                  owner: 'NONE',
                  directionValid: dx < 0,
                  activated: false,
                  captured: false,
                  progress: peekArmedRef.current ? READER_GESTURE.peekProgress : 0,
                  reducedMotion,
                  dominance: Math.abs(dy) > 0 ? Math.abs(dx) / Math.max(1, Math.abs(dy)) : null,
                  targetTag: targetTagName(ev.target),
                  touchAction: readTouchActionForTarget(ev.target),
                  lastAction: 'NONE',
                })
                return
              }
              // Haberi Aç: finger LEFT only (negative dx) — Reader enters from RIGHT.
              if (dx >= 0) {
                clearPeekTimer()
                if (peekArmedRef.current) {
                  peekArmedRef.current = false
                  setDragProgress(0)
                  onOpenReaderCancel?.()
                }
                onGesturePointerDebug?.({
                  phase: 'move',
                  pointerType: ev.pointerType,
                  startX: d.x,
                  currentX: ev.clientX,
                  startY: d.y,
                  currentY: ev.clientY,
                  dx,
                  dy,
                  owner: 'NONE',
                  directionValid: false,
                  activated: false,
                  captured: false,
                  progress: 0,
                  reducedMotion,
                  dominance: Math.abs(dy) > 0 ? Math.abs(dx) / Math.max(1, Math.abs(dy)) : null,
                  targetTag: targetTagName(ev.target),
                  touchAction: readTouchActionForTarget(ev.target),
                  lastAction: 'REJECT_DIRECTION',
                })
                return
              }
              clearPeekTimer()
              d.axis = 'horizontal'
              setHorizontalLocked(true)
              // Capture only after horizontal lock — early capture steals Haberi Oku taps on iOS.
              try {
                surfaceRef.current?.setPointerCapture(ev.pointerId)
              } catch {
                // Non-fatal
              }
              onGesturePointerDebug?.({
                phase: 'move',
                pointerType: ev.pointerType,
                startX: d.x,
                currentX: ev.clientX,
                startY: d.y,
                currentY: ev.clientY,
                dx,
                dy,
                owner: 'HORIZONTAL',
                directionValid: true,
                activated: true,
                captured: true,
                progress: Math.max(
                  peekArmedRef.current ? READER_GESTURE.peekProgress : 0,
                  feedToReaderProgress(dx, window.innerWidth || 390)
                ),
                reducedMotion,
                dominance: Math.abs(dy) > 0 ? Math.abs(dx) / Math.max(1, Math.abs(dy)) : null,
                targetTag: targetTagName(ev.target),
                touchAction: 'none',
                lastAction: 'LOCK',
              })
            }
          }
          if (sheetOpen) {
            if (d.axis !== 'vertical') return
            ev.preventDefault()
            onGesturePointerDebug?.({
              phase: 'move',
              pointerType: ev.pointerType,
              startX: d.x,
              currentX: ev.clientX,
              startY: d.y,
              currentY: ev.clientY,
              dx,
              dy,
              owner: 'VERTICAL',
              directionValid: false,
              activated: true,
              captured: true,
              progress: 0,
              reducedMotion,
              targetTag: targetTagName(ev.target),
              touchAction: readTouchActionForTarget(ev.target),
              lastAction: 'LOCK',
            })
            d.lastX = ev.clientX
            d.lastT = performance.now()
            return
          }
          if (d.axis !== 'horizontal') return
          ev.preventDefault()
          const width = window.innerWidth || 390
          const progress = Math.max(
            peekArmedRef.current ? READER_GESTURE.peekProgress : 0,
            feedToReaderProgress(dx, width)
          )
          setDragProgress(progress)
          onOpenReaderProgress?.(progress)
          onGesturePointerDebug?.({
            phase: 'move',
            pointerType: ev.pointerType,
            startX: d.x,
            currentX: ev.clientX,
            startY: d.y,
            currentY: ev.clientY,
            dx,
            dy,
            owner: 'HORIZONTAL',
            directionValid: dx < 0,
            activated: true,
            captured: true,
            progress,
            reducedMotion,
            dominance: Math.abs(dy) > 0 ? Math.abs(dx) / Math.max(1, Math.abs(dy)) : null,
            targetTag: targetTagName(ev.target),
            touchAction: 'none',
            lastAction: 'LOCK',
          })
          d.lastX = ev.clientX
          d.lastT = performance.now()
        }
        drag.current = {
          pointerId,
          x: startX,
          y: startY,
          lastX: startX,
          lastT: performance.now(),
          axis: 'none',
          moveListener,
        }
        e.currentTarget.addEventListener('pointermove', moveListener, { passive: false })

        // Subtle Reader discovery peek (3–5% from RIGHT) after short still-down qualify.
        // Reuses the same uncommitted readerSession — not a second Reader.
        clearPeekTimer()
        peekArmedRef.current = false
        if (pageTurnOpen && !sheetOpen && !reducedMotion) {
          const qualifyPointerId = pointerId
          peekTimerRef.current = window.setTimeout(() => {
            peekTimerRef.current = null
            const d = drag.current
            if (!d || d.pointerId !== qualifyPointerId || d.axis !== 'none') return
            peekArmedRef.current = true
            setDragProgress(READER_GESTURE.peekProgress)
            onOpenReaderProgress?.(READER_GESTURE.peekProgress)
            onGesturePointerDebug?.({
              phase: 'move',
              pointerType: e.pointerType,
              startX,
              currentX: startX,
              startY,
              currentY: startY,
              dx: 0,
              dy: 0,
              owner: 'NONE',
              directionValid: true,
              activated: false,
              captured: false,
              progress: READER_GESTURE.peekProgress,
              reducedMotion,
              targetTag: targetTagName(e.target),
              touchAction: readTouchActionForTarget(e.target),
              lastAction: 'NONE',
            })
          }, READER_GESTURE.peekQualifyMs)
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current
        const sheetOpen = Boolean(onOpenSheetGesture)
        clearPeekTimer()
        if ((!onOpenReaderGesture && !onOpenSheetGesture) || !d || d.pointerId !== e.pointerId) {
          if (d) resetDragVisual(false)
          return
        }
        clearNativeMove()
        const axis = d.axis
        const hadPeek = peekArmedRef.current
        drag.current = null
        setHorizontalLocked(false)
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
        if (sheetOpen) {
          peekArmedRef.current = false
          if (axis !== 'vertical') {
            resetDragVisual(false)
            return
          }
          const upPx = -dy
          const velocityUp = -dy / dt
          const complete = upPx >= 72 || (upPx >= 36 && velocityUp >= 0.45)
          if (complete) onOpenSheetGesture?.()
          resetDragVisual(false)
          return
        }
        const velocityX = (e.clientX - d.lastX) / dt
        const width = typeof window !== 'undefined' ? window.innerWidth : 390
        const progress = Math.max(
          hadPeek ? READER_GESTURE.peekProgress : 0,
          feedToReaderProgress(dx, width)
        )
        const open =
          axis === 'horizontal' &&
          shouldCompleteTransition({
            progress,
            // Completing direction is LEFT → negative velocity; normalize to positive.
            velocityX: Math.max(0, -velocityX),
          })

        onGesturePointerDebug?.({
          phase: 'up',
          pointerType: e.pointerType,
          startX: d.x,
          currentX: e.clientX,
          startY: d.y,
          currentY: e.clientY,
          dx,
          dy,
          owner: axis === 'horizontal' ? 'HORIZONTAL' : axis === 'vertical' ? 'VERTICAL' : 'NONE',
          directionValid: dx < 0,
          activated: axis === 'horizontal',
          captured: false,
          progress,
          reducedMotion,
          dominance: Math.abs(dy) > 0 ? Math.abs(dx) / Math.max(1, Math.abs(dy)) : null,
          targetTag: targetTagName(e.target),
          touchAction: readTouchActionForTarget(e.target),
          lastAction: open
            ? 'COMMIT'
            : axis !== 'horizontal'
              ? 'REJECT_AXIS'
              : dx >= 0
                ? 'REJECT_DIRECTION'
                : 'REJECT_THRESHOLD',
        })

        // Always report metrics to parent (diagnostic + shared open decision).
        onOpenReaderGesture?.({
          dx,
          dy,
          startClientX: d.x,
          viewportWidth: width,
          velocityX,
        })

        if (open) {
          peekArmedRef.current = false
          setSnapAnimating(true)
          setDragProgress(1)
          onOpenReaderProgress?.(1)
          window.setTimeout(() => {
            setSnapAnimating(false)
            setDragProgress(0)
          }, reducedMotion ? 0 : FEED_READER_DURATION_MS)
          return
        }

        if (hadPeek || (axis === 'horizontal' && progress > 0.02)) {
          peekArmedRef.current = false
          onOpenReaderCancel?.()
          resetDragVisual(true)
          return
        }
        peekArmedRef.current = false
        resetDragVisual(false)
      }}
      onPointerCancel={(e) => {
        clearPeekTimer()
        peekArmedRef.current = false
        const d = drag.current
        if (d) {
          const dx = typeof e.clientX === 'number' ? e.clientX - d.x : null
          const dy = typeof e.clientY === 'number' ? e.clientY - d.y : null
          onGesturePointerDebug?.({
            phase: 'cancel',
            pointerType: e.pointerType,
            startX: d.x,
            currentX: typeof e.clientX === 'number' ? e.clientX : d.lastX,
            startY: d.y,
            currentY: typeof e.clientY === 'number' ? e.clientY : d.y,
            dx: dx ?? undefined,
            dy: dy ?? undefined,
            owner: d.axis === 'horizontal' ? 'HORIZONTAL' : d.axis === 'vertical' ? 'VERTICAL' : 'OTHER',
            directionValid: typeof dx === 'number' ? dx < 0 : false,
            activated: d.axis === 'horizontal',
            captured: false,
            progress:
              typeof dx === 'number' ? feedToReaderProgress(dx, window.innerWidth || 390) : 0,
            reducedMotion,
            targetTag: targetTagName(e.target),
            touchAction: readTouchActionForTarget(e.target),
            lastAction: 'CANCEL',
          })
          onOpenReaderCancel?.()
        }
        resetDragVisual(false)
      }}
    >
      {/* Reader peek during LEFT page-turn (Reader enters from RIGHT) */}
      {pageProgress > 0.04 && !reducedMotion ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-none"
          style={{
            background: 'linear-gradient(90deg, #0c0c0e 0%, #141417 100%)',
            opacity: Math.min(1, pageProgress * 1.4),
          }}
        />
      ) : null}
      <FullscreenNewsCard
        {...cardProps}
        cardRef={impressionRef}
        swipeDiscoverySuppressed={Boolean(props.swipeDiscoverySuppressed || pageProgress > 0.02)}
        showDiscoveryRail={Boolean(props.showDiscoveryRail) && pageProgress <= 0.02}
      />
    </div>
  )
}
