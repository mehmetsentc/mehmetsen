'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Inbox, CheckCircle2, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { FullscreenNewsCard } from '@/components/feed/smart/FullscreenNewsCard'
import { FullscreenNewsCardSkeleton } from '@/components/feed/smart/FullscreenNewsCardSkeleton'
import { FeedModeNav } from '@/components/feed/smart/FeedModeNav'
import { CommentsBottomSheet } from '@/components/feed/smart/CommentsBottomSheet'
import { FEED_PAGINATION } from '@/lib/feed/config'
import {
  getOrCreateFeedSessionId,
  readGuestSeen,
  writeGuestSeen,
  useFeedImpressionRef,
} from '@/lib/feed/feedSeenClient'
import { clearFeedRestore, readFeedRestore, saveFeedRestore } from '@/lib/feed/feedRestoration'
import { isSocialGraphEnabledClient } from '@/lib/social/featureFlagClient'
import { socialApi } from '@/lib/social/clientApi'
import { buildAuthIntent, loginHrefWithIntent } from '@/lib/social/authIntent'
import { getClientAuthToken } from '@/lib/firebase/auth'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { ROUTES } from '@/constants/routes'
import type { FeedItemDto, FeedMode, FeedPageDto } from '@/types/smartFeed'

const WINDOW_MAX = 25

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
}

async function fetchFeedPage(opts: {
  mode: FeedMode
  cursor?: string | null
  city?: string | null
  district?: string | null
  refresh?: boolean
  signal?: AbortSignal
}): Promise<FeedPageDto> {
  const params = new URLSearchParams()
  if (opts.mode !== 'personal') params.set('mode', opts.mode)
  if (opts.cursor) params.set('cursor', opts.cursor)
  if (opts.refresh) params.set('refresh', '1')
  params.set('limit', String(FEED_PAGINATION.defaultLimit))
  if (opts.city) params.set('city', opts.city)
  if (opts.district) params.set('district', opts.district)

  const headers: Record<string, string> = {
    'x-feed-session': getOrCreateFeedSessionId(),
  }
  const token = await getClientAuthToken()
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
  events?: Array<{ eventType: string; articleId?: string; feedType?: string; dwellMs?: number }>
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
  debug?: boolean
}

export function SmartFeedClient({ initialCitySlug, initialDistrictSlug, debug }: SmartFeedClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user: authUser, loading: authLoading } = useAuthContext()
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeIndexRef = useRef(0)
  const dwellStartRef = useRef<number | null>(null)
  const generationIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const [mode, setMode] = useState<FeedMode>(() => parseMode(searchParams.get('mode')))
  const [items, setItems] = useState<FeedItemDto[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [errorState, setErrorState] = useState<FeedErrorState>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [commentArticleId, setCommentArticleId] = useState<string | null>(null)
  const [social, setSocial] = useState<Record<string, SocialItemState>>({})
  const [actionLoading, setActionLoading] = useState<Record<string, 'like' | 'save'>>({})

  const isDebug = Boolean(debug || searchParams.get('debug') === '1')
  const socialEnabled = isSocialGraphEnabledClient()
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const windowStart = Math.max(0, activeIndex - 5)
  const windowItems = items.slice(windowStart, windowStart + WINDOW_MAX)

  const cursorRef = useRef<string | null>(null)
  cursorRef.current = cursor

  const loadPage = useCallback(
    async (append: boolean, nextCursor?: string | null, targetMode?: FeedMode) => {
      const activeMode = targetMode ?? mode
      const genId = ++generationIdRef.current

      // If initiating a full refresh or mode change, abort previous controller
      if (!append) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
        abortControllerRef.current = new AbortController()
      }

      const signal = !append ? abortControllerRef.current?.signal : undefined

      if (append) setLoadingMore(true)
      else {
        setLoading(true)
        setErrorState(null)
      }

      try {
        const page = await fetchFeedPage({
          mode: activeMode,
          cursor: append ? (nextCursor ?? cursorRef.current) : null,
          city: initialCitySlug,
          district: initialDistrictSlug,
          refresh: !append,
          signal,
        })

        // Drop out-of-order responses from stale generation requests
        if (genId !== generationIdRef.current) return

        setErrorState(null)
        setItems((prev) => {
          const merged = append ? [...prev, ...page.items] : page.items
          const seen = new Set<string>()
          return merged.filter((i) => {
            if (seen.has(i.articleId)) return false
            seen.add(i.articleId)
            return true
          })
        })
        setSocial((prev) => {
          const next = { ...prev }
          for (const it of page.items) {
            if (!next[it.articleId]) {
              next[it.articleId] = {
                liked: it.socialState?.liked ?? false,
                saved: it.socialState?.saved ?? false,
                likeCount: it.socialCounts.likes ?? 0,
                commentCount: it.socialCounts.comments ?? 0,
              }
            }
          }
          return next
        })
        setCursor(page.nextCursor)
        cursorRef.current = page.nextCursor
        setHasMore(page.hasMore)
        if (!append) {
          const restore = readFeedRestore()
          const restoreId = searchParams.get('restore') ?? restore?.articleId
          if (restoreId) {
            const idx = page.items.findIndex((i) => i.articleId === restoreId)
            if (idx >= 0) setActiveIndex(idx)
            clearFeedRestore()
          }
        }
      } catch (err: unknown) {
        // Drop cancelled / aborted fetches silently
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
            message: 'Akıllı akış şu anda pilot kullanıcılara özeldir.',
          })
        } else {
          setErrorState({
            type: 'NETWORK_ERROR',
            message: 'Haber akışı yüklenirken bir sorun oluştu.',
          })
        }
        await postTelemetry({ events: [{ eventType: 'feed_error', feedType: activeMode }] })
      } finally {
        if (genId === generationIdRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [mode, initialCitySlug, initialDistrictSlug, searchParams]
  )

  const handleModeChange = useCallback(
    (newMode: FeedMode) => {
      if (newMode === mode && items.length > 0) return
      setMode(newMode)
      setItems([])
      setCursor(null)
      setActiveIndex(0)
      setErrorState(null)
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0
      }
      void loadPage(false, null, newMode)
    },
    [mode, items.length, loadPage]
  )

  useEffect(() => {
    if (authLoading) return
    void loadPage(false)

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [authLoading, authUser?.uid, loadPage])

  useEffect(() => {
    if (!items.length) return
    const ids = items.map((i) => i.articleId)
    let cancelled = false
    socialApi
      .getArticleState(ids)
      .then((res) => {
        if (cancelled) return
        const states = (res as { states?: Array<{ articleId: string; liked: boolean; saved: boolean }> }).states ?? []
        if (!states.length) return
        setSocial((prev) => {
          const next = { ...prev }
          for (const s of states) {
            const existing = next[s.articleId]
            next[s.articleId] = {
              liked: s.liked,
              saved: s.saved,
              likeCount: existing?.likeCount ?? 0,
              commentCount: existing?.commentCount ?? 0,
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
    const item = items[activeIndex]
    dwellStartRef.current = Date.now()

    if (item && items.length - activeIndex <= FEED_PAGINATION.prefetchThreshold && hasMore && !loadingMore) {
      void loadPage(true, cursor)
    }
  }, [activeIndex, items, hasMore, loadingMore, cursor, loadPage])

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current
      if (!el) return
      const child = el.children[index] as HTMLElement | undefined
      if (child) {
        child.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
      }
      setActiveIndex(index)
    },
    [reducedMotion]
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
    if (!el) return
    const h = el.clientHeight || 1
    const idx = Math.round(el.scrollTop / h)
    if (idx !== activeIndexRef.current && idx >= 0 && idx < items.length) {
      const prev = items[activeIndexRef.current]
      const dwell = dwellStartRef.current ? Date.now() - dwellStartRef.current : 0
      if (prev && dwell < 1500) {
        void postTelemetry({
          events: [{ eventType: 'quick_skip', articleId: prev.articleId, feedType: mode, dwellMs: dwell }],
        })
      }
      setActiveIndex(idx)
    }
  }, [items, mode])

  const recordImpression = useCallback(
    (item: FeedItemDto) => {
      const guestSeen = readGuestSeen()
      guestSeen.add(item.articleId)
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

  const toggleLike = useCallback(
    async (item: FeedItemDto) => {
      if (actionLoading[item.articleId]) return
      if (!authUser) {
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
      } catch {
        setSocial((s) => ({
          ...s,
          [item.articleId]: {
            ...(s[item.articleId] ?? current),
            liked: prevLiked,
            likeCount: prevCount,
          },
        }))
        toast.error('Beğeni kaydedilemedi')
      } finally {
        setActionLoading((s) => {
          const next = { ...s }
          delete next[item.articleId]
          return next
        })
      }
    },
    [actionLoading, authUser, router, searchParams, social]
  )

  const toggleSave = useCallback(
    async (item: FeedItemDto) => {
      if (actionLoading[item.articleId]) return
      if (!authUser) {
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
      }

      const prevSaved = current.saved
      const nextSaved = !prevSaved

      setActionLoading((s) => ({ ...s, [item.articleId]: 'save' }))

      setSocial((s) => ({
        ...s,
        [item.articleId]: {
          ...(s[item.articleId] ?? current),
          saved: nextSaved,
        },
      }))

      try {
        const res = prevSaved
          ? await socialApi.unsaveArticle(item.articleId)
          : await socialApi.saveArticle(item.articleId)

        const body = res as { saved?: boolean }
        const canonicalSaved = typeof body.saved === 'boolean' ? body.saved : nextSaved

        setSocial((s) => ({
          ...s,
          [item.articleId]: {
            ...(s[item.articleId] ?? current),
            saved: canonicalSaved,
          },
        }))
      } catch {
        setSocial((s) => ({
          ...s,
          [item.articleId]: {
            ...(s[item.articleId] ?? current),
            saved: prevSaved,
          },
        }))
        toast.error('Kaydetme işlemi başarısız')
      } finally {
        setActionLoading((s) => {
          const next = { ...s }
          delete next[item.articleId]
          return next
        })
      }
    },
    [actionLoading, authUser, router, searchParams, social]
  )

  const handleFeedback = useCallback((articleId: string) => {
    setItems((prev) => prev.filter((i) => i.articleId !== articleId))
  }, [])

  const handleCommentAdded = useCallback((articleId: string) => {
    setSocial((s) => {
      const existing = s[articleId]
      if (!existing) return s
      return {
        ...s,
        [articleId]: {
          ...existing,
          commentCount: existing.commentCount + 1,
        },
      }
    })
  }, [])

  const onRead = (item: FeedItemDto, index: number) => {
    saveFeedRestore({ mode, articleId: item.articleId, cursor, scrollIndex: index })
    void postTelemetry({ events: [{ eventType: 'article_opened', articleId: item.articleId, feedType: mode }] })
    router.push(ROUTES.NEWS_DETAIL(item.slug))
  }

  const emptyState = useMemo(() => {
    if (loading) return null
    if (mode === 'following') {
      return {
        title: 'Takip Ettiğin Yayıncı Yok',
        description: 'Henüz takip ettiğin yayıncı yok veya yeni bir paylaşımları bulunmuyor.',
      }
    }
    if (mode === 'local') {
      return {
        title: 'Yerel Haber Yok',
        description: 'Bu konumda henüz haber bulunmuyor.',
      }
    }
    if (mode === 'breaking') {
      return {
        title: 'Son Dakika Yok',
        description: 'Şu an son dakika haberi bulunmuyor.',
      }
    }
    return {
      title: 'Haber Akışı Boş',
      description: 'Şu an gösterilecek haber bulunamadı.',
    }
  }, [loading, mode])

  const isLoadingFirstTime = (loading || authLoading) && items.length === 0

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
        {/* Top Mode Navigation — Always mounted at canonical container top */}
        <FeedModeNav
          mode={mode}
          onChange={handleModeChange}
        />

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
                  ? 'Pilot Önizleme Modu'
                  : 'Yükleme Hatası'}
            </h2>
            <p className="max-w-xs text-sm text-white/60 mb-6">{errorState.message}</p>
            {errorState.type === 'AUTH_REQUIRED' || (!authUser && errorState.type === 'DISABLED') ? (
              <Link
                href={`/login?next=${encodeURIComponent('/feed-v2')}`}
                className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Giriş Yap
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void loadPage(false)}
                className="flex items-center gap-2 rounded-full bg-white/20 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <RefreshCw className="h-4 w-4" />
                Tekrar Dene
              </button>
            )}
            {isDebug ? (
              <div className="mt-4 rounded bg-white/5 px-3 py-1.5 text-xs text-amber-300">
                [DIAGNOSTIC] status: {errorState.type} | user: {authUser?.uid ?? 'guest'} | mode: {mode}
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
              <Inbox className="h-8 w-8 text-white/70" />
            </div>
            <h2 className="mb-1 text-lg font-bold text-white">{emptyState?.title}</h2>
            <p className="max-w-xs text-sm text-white/60 mb-4">{emptyState?.description}</p>
            <button
              type="button"
              onClick={() => void loadPage(false)}
              className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Yenile
            </button>
            {isDebug ? (
              <div className="mt-4 rounded bg-white/5 px-3 py-1.5 text-xs text-green-300">
                [DIAGNOSTIC] status: EMPTY_INVENTORY | user: {authUser?.uid ?? 'guest'} | items: 0 | mode: {mode}
              </div>
            ) : null}
          </div>
        ) : (
          /* Populated Snap Scroll Feed */
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="h-[100dvh] w-full snap-y snap-mandatory overflow-y-scroll"
            style={{ scrollSnapType: reducedMotion ? 'none' : 'y mandatory' }}
            role="feed"
            aria-label="Akıllı haber akışı"
            data-testid="smart-feed-scroll-container"
          >
            {windowItems.map((item, wi) => {
              const index = windowStart + wi
              const isActive = index === activeIndex
              const socialState = social[item.articleId]
              const liked = socialState?.liked ?? item.socialState?.liked ?? false
              const saved = socialState?.saved ?? item.socialState?.saved ?? false
              const likeCount = socialState?.likeCount ?? item.socialCounts.likes ?? 0

              return (
                <FeedCardWithImpression
                  key={item.articleId}
                  item={item}
                  isActive={isActive}
                  debug={isDebug}
                  liked={liked}
                  saved={saved}
                  likeCount={likeCount}
                  likeLoading={actionLoading[item.articleId] === 'like'}
                  saveLoading={actionLoading[item.articleId] === 'save'}
                  onToggleLike={() => void toggleLike(item)}
                  onToggleSave={() => void toggleSave(item)}
                  onCommentClick={() => setCommentArticleId(item.articleId)}
                  onReadClick={() => onRead(item, index)}
                  onFeedback={() => handleFeedback(item.articleId)}
                  onImpression={() => recordImpression(item)}
                />
              )
            })}
            {loadingMore ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            ) : null}
            {!hasMore && items.length > 0 ? (
              <div className="flex h-[100dvh] w-full snap-start snap-always flex-col items-center justify-center bg-black px-6 text-center text-white">
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
          onCommentAdded={() => {
            if (commentArticleId) handleCommentAdded(commentArticleId)
          }}
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
  likeLoading?: boolean
  saveLoading?: boolean
  onToggleLike: () => void
  onToggleSave: () => void
  onCommentClick: () => void
  onReadClick: () => void
  onFeedback?: () => void
  onImpression: () => void
}) {
  const impressionRef = useFeedImpressionRef(props.item.articleId, props.isActive, props.onImpression)
  return (
    <FullscreenNewsCard
      {...props}
      cardRef={impressionRef}
    />
  )
}
