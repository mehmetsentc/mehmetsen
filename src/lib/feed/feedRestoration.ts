'use client'

import { isHomePathname } from '@/constants/routes'
import {
  FEED_RESTORE_MAX_ITEMS,
  FEED_RESTORE_STORAGE_KEY,
  FEED_RESTORE_TTL_MS,
} from '@/lib/feed/config'
import type { FeedItemDto, FeedMode } from '@/types/smartFeed'

export type FeedRestoreSource = 'canonical' | 'route_exit'

export interface FeedRestoreState {
  mode: FeedMode
  /** Active category chip id (parent/leaf); null = Sana Özel / mode-only. */
  category?: string | null
  articleId: string
  cursor?: string | null
  hasMore?: boolean
  scrollIndex: number
  /** Snapshot of loaded cards so back-navigation does not re-rank from page 0. */
  items?: FeedItemDto[]
  timestamp?: number
  /** True until a successful restore consumes the snapshot. */
  pending?: boolean
  /**
   * canonical = left via /haber (CASE B: Zap must clear)
   * route_exit = left Feed V2 for Profile/Search/etc (warm return: Zap must keep)
   */
  source?: FeedRestoreSource
  /** Auth isolation: firebase uid or 'guest'. Mismatch invalidates snapshot. */
  userKey?: string | null
  /** Articles already qualified-impressed this session — avoid duplicate telemetry on warm restore. */
  impressedArticleIds?: string[]
}

function sessionStore(): Storage | null {
  if (typeof window !== 'undefined') return window.sessionStorage
  if (typeof globalThis !== 'undefined' && 'sessionStorage' in globalThis) {
    return (globalThis as typeof globalThis & { sessionStorage: Storage }).sessionStorage
  }
  return null
}

export function saveFeedRestore(state: FeedRestoreState): void {
  const items = Array.isArray(state.items)
    ? state.items.slice(0, FEED_RESTORE_MAX_ITEMS)
    : undefined
  const impressed = Array.isArray(state.impressedArticleIds)
    ? state.impressedArticleIds.slice(0, FEED_RESTORE_MAX_ITEMS)
    : undefined
  const payload: FeedRestoreState = {
    ...state,
    items,
    impressedArticleIds: impressed,
    timestamp: state.timestamp ?? Date.now(),
    pending: state.pending ?? true,
    source: state.source ?? 'canonical',
  }
  sessionStore()?.setItem(FEED_RESTORE_STORAGE_KEY, JSON.stringify(payload))
}

export function readFeedRestore(): FeedRestoreState | null {
  try {
    const raw = sessionStore()?.getItem(FEED_RESTORE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FeedRestoreState
    if (!parsed?.articleId || !parsed?.mode) return null
    const ts = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0
    if (ts > 0 && Date.now() - ts > FEED_RESTORE_TTL_MS) {
      clearFeedRestore()
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Valid pending restore for article→back or warm route return. */
export function consumePendingFeedRestore(opts?: {
  userKey?: string | null
}): FeedRestoreState | null {
  const restore = readFeedRestore()
  if (!restore?.pending) return null
  if (!Array.isArray(restore.items) || restore.items.length === 0) return null
  const expected = opts?.userKey ?? null
  if (restore.userKey != null && expected != null && restore.userKey !== expected) {
    clearFeedRestore()
    return null
  }
  const idx =
    typeof restore.scrollIndex === 'number' && restore.scrollIndex >= 0
      ? restore.scrollIndex
      : restore.items.findIndex((i) => i.articleId === restore.articleId)
  if (idx < 0 || idx >= restore.items.length) return null
  return { ...restore, scrollIndex: idx }
}

export function clearFeedRestore(): void {
  sessionStore()?.removeItem(FEED_RESTORE_STORAGE_KEY)
}

const FEED_RESTORE_DOC_ORIGIN_KEY = 'nahaber_feed_restore_doc_origin_v1'

function documentNavigationPathname(): string | null {
  if (typeof window === 'undefined') return null
  const nav =
    typeof performance !== 'undefined'
      ? (performance.getEntriesByType?.('navigation')?.[0] as
          | PerformanceNavigationTiming
          | undefined)
      : undefined
  const raw = nav?.name || window.location.href
  try {
    return new URL(raw, window.location.origin).pathname
  } catch {
    return window.location.pathname || null
  }
}

/** True when this JS document itself loaded on Feed V2 (PWA kill → last URL), not a client Zap. */
export function isDocumentNavigationToFeedV2(): boolean {
  const path = documentNavigationPathname()
  return path === '/feed-v2' || Boolean(path?.startsWith('/feed-v2/'))
}

/**
 * iOS standalone PWA keeps sessionStorage across kill and relaunches the last URL.
 * A document load on /feed-v2 must drop the frozen 15-card snapshot. Same-document
 * remounts (Profile → Zap) keep the mark and still restore.
 */
export function clearFeedRestoreOnFeedV2ColdStart(): boolean {
  if (typeof window === 'undefined') return false
  if (!isDocumentNavigationToFeedV2()) return false
  const origin =
    typeof performance !== 'undefined' ? String(performance.timeOrigin) : '0'
  try {
    const store = sessionStore()
    if (store?.getItem(FEED_RESTORE_DOC_ORIGIN_KEY) === origin) return false
    store?.setItem(FEED_RESTORE_DOC_ORIGIN_KEY, origin)
  } catch {
    /* private mode — still drop the snapshot */
  }
  clearFeedRestore()
  return true
}

/**
 * Zap / main-nav entry to Feed V2:
 * - Keep warm route_exit snapshots (Profile / Search → Feed V2)
 * - Clear when entering from magazine home (close/reopen must not replay the same 15)
 * - Clear canonical article→back snapshots (CASE B fresh entry)
 * - Always clear when already on /feed-v2 (explicit re-tap refresh)
 */
export function clearFeedRestoreForFeedV2Nav(opts: {
  pathname: string
}): void {
  const path = opts.pathname || ''
  if (path === '/feed-v2' || path.startsWith('/feed-v2?') || isHomePathname(path)) {
    clearFeedRestore()
    return
  }
  const restore = readFeedRestore()
  if (restore?.source === 'route_exit' && restore.pending) return
  clearFeedRestore()
}

export function buildFeedV2Url(mode: FeedMode, restore?: FeedRestoreState | null): string {
  const params = new URLSearchParams()
  if (mode !== 'personal') params.set('mode', mode)
  if (restore?.category) params.set('category', restore.category)
  if (restore?.articleId) params.set('restore', restore.articleId)
  const q = params.toString()
  return q ? `/feed-v2?${q}` : '/feed-v2'
}
