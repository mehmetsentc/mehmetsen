'use client'

import { FEED_RESTORE_STORAGE_KEY } from '@/lib/feed/config'
import type { FeedMode } from '@/types/smartFeed'

export interface FeedRestoreState {
  mode: FeedMode
  articleId: string
  cursor?: string | null
  scrollIndex: number
}

function sessionStore(): Storage | null {
  if (typeof window !== 'undefined') return window.sessionStorage
  if (typeof globalThis !== 'undefined' && 'sessionStorage' in globalThis) {
    return (globalThis as typeof globalThis & { sessionStorage: Storage }).sessionStorage
  }
  return null
}

export function saveFeedRestore(state: FeedRestoreState): void {
  sessionStore()?.setItem(FEED_RESTORE_STORAGE_KEY, JSON.stringify(state))
}

export function readFeedRestore(): FeedRestoreState | null {
  try {
    const raw = sessionStore()?.getItem(FEED_RESTORE_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as FeedRestoreState
  } catch {
    return null
  }
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
