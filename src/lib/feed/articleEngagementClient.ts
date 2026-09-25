'use client'

import { auth } from '@/lib/firebase/auth'
import { getOrCreateFeedSessionId } from '@/lib/feed/feedSeenClient'
import {
  nextEngagementFlush,
  type ArticleEngagementSource,
  type EngagementFlushState,
} from '@/lib/feed/articleEngagement'

const VIEW_KEY = (source: ArticleEngagementSource, id: string) => `nahaber-viewed:${source}:${id}`
/** Legacy article-page key used by the old viewsCount hook. */
const LEGACY_OPEN_KEY = (id: string) => `nahaber-viewed:${id}`

function isOpenLike(source: ArticleEngagementSource): boolean {
  return source === 'open' || source === 'reader' || source === 'page'
}

function alreadyCounted(source: ArticleEngagementSource, id: string): boolean {
  try {
    if (sessionStorage.getItem(VIEW_KEY(source, id)) === '1') return true
    if (isOpenLike(source) && sessionStorage.getItem(LEGACY_OPEN_KEY(id)) === '1') return true
  } catch {
    /* private mode */
  }
  return false
}

function markCounted(source: ArticleEngagementSource, id: string): void {
  try {
    sessionStorage.setItem(VIEW_KEY(source, id), '1')
    if (isOpenLike(source)) sessionStorage.setItem(LEGACY_OPEN_KEY(id), '1')
  } catch {
    /* quota */
  }
}

let lastAuthToken: string | null = null

function sendEngagement(payload: string, token: string | null): void {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  fetch('/api/news/engagement', {
    method: 'POST',
    headers,
    body: payload,
    keepalive: true,
  }).catch(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon('/api/news/engagement', blob)
    }
  })
}

export function postArticleEngagement(input: {
  articleId: string
  source: ArticleEngagementSource
  dwellMs?: number
  countView?: boolean
}): void {
  const id = input.articleId?.trim()
  if (!id) return
  let countView = Boolean(input.countView)
  const dwellMs = Math.max(0, Math.round(input.dwellMs ?? 0))
  if (countView && alreadyCounted(input.source, id)) countView = false
  if (!countView && dwellMs <= 0) return
  if (countView) markCounted(input.source, id)

  const sessionId = getOrCreateFeedSessionId()
  const payload = JSON.stringify({
    id,
    source: input.source,
    dwellMs,
    countView,
    sessionId: sessionId || undefined,
  })

  const user = auth.currentUser
  if (user) {
    void user
      .getIdToken()
      .then((token) => {
        lastAuthToken = token
        sendEngagement(payload, token)
      })
      .catch(() => sendEngagement(payload, lastAuthToken))
    return
  }
  sendEngagement(payload, lastAuthToken)
}

export function createEngagementTracker(source: ArticleEngagementSource) {
  const states = new Map<string, EngagementFlushState & { startedAt: number }>()

  const start = (articleId: string, now = Date.now()) => {
    const id = articleId.trim()
    if (!id) return
    const existing = states.get(id)
    if (existing) return
    states.set(id, {
      startedAt: now,
      elapsedMs: 0,
      flushedMs: 0,
      viewCounted: alreadyCounted(source, id),
    })
  }

  const flush = (articleId: string, now = Date.now()) => {
    const id = articleId.trim()
    const row = states.get(id)
    if (!id || !row) return
    row.elapsedMs = Math.max(row.elapsedMs, now - row.startedAt)
    const next = nextEngagementFlush(row, source)
    if (!next.countView && !next.dwellDeltaMs) return
    if (next.countView) markCounted(source, id)
    postArticleEngagement({
      articleId: id,
      source,
      dwellMs: next.dwellDeltaMs,
      countView: next.countView,
    })
    row.flushedMs = next.nextFlushedMs
    row.viewCounted = next.nextViewCounted
  }

  const end = (articleId: string, now = Date.now()) => {
    flush(articleId, now)
    states.delete(articleId.trim())
  }

  return { start, flush, end }
}
