'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { FullscreenNewsCard } from '@/components/feed/smart/FullscreenNewsCard'
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
import { auth } from '@/lib/firebase/auth'
import { ROUTES } from '@/constants/routes'
import type { FeedItemDto, FeedMode, FeedPageDto } from '@/types/smartFeed'

const WINDOW_MAX = 25

function parseMode(raw: string | null): FeedMode {
  const m = (raw ?? 'personal').trim().toLowerCase()
  if (m === 'following' || m === 'breaking' || m === 'local' || m === 'personal') return m
  return 'personal'
}

async function fetchFeedPage(opts: {
  mode: FeedMode
  cursor?: string | null
  city?: string | null
  district?: string | null
  refresh?: boolean
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
  const user = auth.currentUser
  if (user) {
    headers.Authorization = `Bearer ${await user.getIdToken()}`
  }

  const res = await fetch(`/api/feed/v2?${params}`, { headers })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'feed_fetch_failed')
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
  const user = auth.currentUser
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`
  await fetch('/api/feed/telemetry', { method: 'POST', headers, body: JSON.stringify(payload) }).catch(() => {})
}

interface SmartFeedClientProps {
  initialCitySlug?: string | null
  initialDistrictSlug?: string | null
  debug?: boolean
}

export function SmartFeedClient({ initialCitySlug, initialDistrictSlug, debug }: SmartFeedClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeIndexRef = useRef(0)
  const dwellStartRef = useRef<number | null>(null)

  const [mode, setMode] = useState<FeedMode>(() => parseMode(searchParams.get('mode')))
  const [items, setItems] = useState<FeedItemDto[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [commentArticleId, setCommentArticleId] = useState<string | null>(null)
  const [social, setSocial] = useState<Record<string, { liked: boolean; saved: boolean }>>({})
  const [actionLoading, setActionLoading] = useState<Record<string, 'like' | 'save'>>({})

  const socialEnabled = isSocialGraphEnabledClient()
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const windowStart = Math.max(0, activeIndex - 5)
  const windowItems = items.slice(windowStart, windowStart + WINDOW_MAX)

  const loadPage = useCallback(
    async (append: boolean, nextCursor?: string | null) => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      try {
        const page = await fetchFeedPage({
          mode,
          cursor: append ? (nextCursor ?? cursor) : null,
          city: initialCitySlug,
          district: initialDistrictSlug,
          refresh: !append,
        })
        setItems((prev) => {
          const merged = append ? [...prev, ...page.items] : page.items
          const seen = new Set<string>()
          return merged.filter((i) => {
            if (seen.has(i.articleId)) return false
            seen.add(i.articleId)
            return true
          })
        })
        setCursor(page.nextCursor)
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
      } catch {
        await postTelemetry({ events: [{ eventType: 'feed_error', feedType: mode }] })
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [mode, cursor, initialCitySlug, initialDistrictSlug, searchParams]
  )

  useEffect(() => {
    void loadPage(false)
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!items.length) return
    const ids = items.map((i) => i.articleId)
    socialApi
      .getArticleState(ids)
      .then((res) => {
        const states = (res as { states?: Array<{ articleId: string; liked: boolean; saved: boolean }> }).states ?? []
        const map: Record<string, { liked: boolean; saved: boolean }> = {}
        for (const s of states) map[s.articleId] = { liked: s.liked, saved: s.saved }
        setSocial(map)
      })
      .catch(() => {})
  }, [items])

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

  const toggleLike = async (item: FeedItemDto) => {
    setActionLoading((s) => ({ ...s, [item.articleId]: 'like' }))
    const prev = social[item.articleId]?.liked ?? false
    setSocial((s) => ({ ...s, [item.articleId]: { liked: !prev, saved: s[item.articleId]?.saved ?? false } }))
    try {
      if (prev) await socialApi.unlikeArticle(item.articleId)
      else await socialApi.likeArticle(item.articleId)
    } catch {
      setSocial((s) => ({ ...s, [item.articleId]: { liked: prev, saved: s[item.articleId]?.saved ?? false } }))
    } finally {
      setActionLoading((s) => {
        const next = { ...s }
        delete next[item.articleId]
        return next
      })
    }
  }

  const toggleSave = async (item: FeedItemDto) => {
    setActionLoading((s) => ({ ...s, [item.articleId]: 'save' }))
    const prev = social[item.articleId]?.saved ?? false
    setSocial((s) => ({ ...s, [item.articleId]: { liked: s[item.articleId]?.liked ?? false, saved: !prev } }))
    try {
      if (prev) await socialApi.unsaveArticle(item.articleId)
      else await socialApi.saveArticle(item.articleId)
    } catch {
      setSocial((s) => ({ ...s, [item.articleId]: { liked: s[item.articleId]?.liked ?? false, saved: prev } }))
    } finally {
      setActionLoading((s) => {
        const next = { ...s }
        delete next[item.articleId]
        return next
      })
    }
  }

  const handleFeedback = useCallback((articleId: string) => {
    setItems((prev) => prev.filter((i) => i.articleId !== articleId))
  }, [])

  const onRead = (item: FeedItemDto, index: number) => {
    saveFeedRestore({ mode, articleId: item.articleId, cursor, scrollIndex: index })
    void postTelemetry({ events: [{ eventType: 'article_opened', articleId: item.articleId, feedType: mode }] })
    router.push(ROUTES.NEWS_DETAIL(item.slug))
  }

  const emptyMessage = useMemo(() => {
    if (loading) return null
    if (mode === 'following') return 'Takip ettiğiniz yayıncılardan haber bulunamadı.'
    if (mode === 'local') return 'Bölgeniz için yerel haber bulunamadı.'
    return 'Gösterilecek haber bulunamadı.'
  }, [loading, mode])

  if (loading && !items.length) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-white" aria-label="Yükleniyor" />
      </div>
    )
  }

  return (
    <div className="relative min-h-[100dvh] bg-black md:flex md:justify-center">
      <FeedModeNav
        mode={mode}
        onChange={(m) => {
          setMode(m)
          setItems([])
          setCursor(null)
          setActiveIndex(0)
        }}
      />

      {!items.length ? (
        <div className="flex h-[100dvh] items-center justify-center px-6 text-center text-white/80">
          {emptyMessage}
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-[100dvh] w-full snap-y snap-mandatory overflow-y-scroll md:max-w-lg"
          style={{ scrollSnapType: reducedMotion ? 'none' : 'y mandatory' }}
          role="feed"
          aria-label="Akıllı haber akışı"
        >
          {windowItems.map((item, wi) => {
            const index = windowStart + wi
            const isActive = index === activeIndex
            return (
              <FeedCardWithImpression
                key={item.articleId}
                item={item}
                isActive={isActive}
                debug={debug}
                liked={social[item.articleId]?.liked ?? item.socialState?.liked ?? false}
                saved={social[item.articleId]?.saved ?? item.socialState?.saved ?? false}
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
        </div>
      )}

      <CommentsBottomSheet
        articleId={commentArticleId ?? ''}
        open={Boolean(commentArticleId)}
        onClose={() => setCommentArticleId(null)}
      />
    </div>
  )
}

function FeedCardWithImpression(props: {
  item: FeedItemDto
  isActive: boolean
  debug?: boolean
  liked: boolean
  saved: boolean
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
