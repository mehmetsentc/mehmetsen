'use client'

import {
  FEED_RESTORE_MAX_ITEMS,
  FEED_RESTORE_STORAGE_KEY,
  FEED_RESTORE_TTL_MS,
} from '@/lib/feed/config'
import type { FeedItemDto, FeedMode } from '@/types/smartFeed'

export interface FeedRestoreState {
  mode: FeedMode
  articleId: string
  cursor?: string | null
  hasMore?: boolean
  scrollIndex: number
  /** Snapshot of loaded cards so back-navigation does not re-rank from page 0. */
  items?: FeedItemDto[]
  timestamp?: number
  /** True until a successful restore consumes the snapshot. */
  pending?: boolean
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
  const payload: FeedRestoreState = {
    ...state,
    items,
    timestamp: state.timestamp ?? Date.now(),
    pending: state.pending ?? true,
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

/** Valid pending restore for article→back (not a fresh main-nav entry). */
export function consumePendingFeedRestore(): FeedRestoreState | null {
  const restore = readFeedRestore()
  if (!restore?.pending) return null
  if (!Array.isArray(restore.items) || restore.items.length === 0) return null
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

export function buildFeedV2Url(mode: FeedMode, restore?: FeedRestoreState | null): string {
  const params = new URLSearchParams()
  if (mode !== 'personal') params.set('mode', mode)
  if (restore?.articleId) params.set('restore', restore.articleId)
  const q = params.toString()
  return q ? `/feed-v2?${q}` : '/feed-v2'
}
