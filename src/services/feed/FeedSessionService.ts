import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import type { FeedMode } from '@/types/smartFeed'

export interface FeedSessionPayload {
  sessionId: string
  seed: number
  mode: FeedMode
  rankedIds: string[]
  createdAt: number
  offset: number
  /** Refill window counter — increments on each candidate-window append. */
  generation?: number
  /** ISO publishedAt boundary for older corpus fallback (exclusive upper bound). */
  olderThan?: string | null
  /** True only when all refill tiers returned no new eligible unseen IDs. */
  corpusExhausted?: boolean
  /** Explicit Feed V2 category tab (e.g. magazin) — session exclusion scoped here. */
  category?: string | null
}

/** Soft cap so session tokens stay bounded; older windows keep appending within this. */
export const FEED_SESSION_RANKED_SOFT_CAP = 400

function sessionSecret(): string {
  return process.env.FEED_SESSION_SECRET?.trim() || 'nahaber-dev-feed-session-v1'
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url')
}

export class FeedSessionService {
  create(
    mode: FeedMode,
    rankedIds: string[],
    seed?: number,
    extras?: Partial<
      Pick<FeedSessionPayload, 'olderThan' | 'generation' | 'corpusExhausted' | 'category'>
    >
  ): FeedSessionPayload {
    return {
      sessionId: randomUUID(),
      seed: seed ?? Math.floor(Math.random() * 1_000_000),
      mode,
      rankedIds,
      createdAt: Date.now(),
      offset: 0,
      generation: extras?.generation ?? 0,
      olderThan: extras?.olderThan ?? null,
      corpusExhausted: extras?.corpusExhausted ?? false,
      category: extras?.category ?? null,
    }
  }

  encode(payload: FeedSessionPayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    const sig = sign(body)
    return `${body}.${sig}`
  }

  decode(token: string | null | undefined): FeedSessionPayload | null {
    if (!token?.includes('.')) return null
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    const expected = sign(body)
    try {
      const a = Buffer.from(sig)
      const b = Buffer.from(expected)
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    } catch {
      return null
    }
    try {
      const json = Buffer.from(body, 'base64url').toString('utf8')
      const parsed = JSON.parse(json) as FeedSessionPayload
      if (!parsed?.sessionId || !Array.isArray(parsed.rankedIds)) return null
      return parsed
    } catch {
      return null
    }
  }

  slicePage(
    payload: FeedSessionPayload,
    limit: number
  ): {
    ids: string[]
    nextPayload: FeedSessionPayload
    hasMoreInSnapshot: boolean
  } {
    const start = payload.offset ?? 0
    const ids = payload.rankedIds.slice(start, start + limit)
    const nextOffset = start + ids.length
    const hasMoreInSnapshot = nextOffset < payload.rankedIds.length
    return {
      ids,
      nextPayload: { ...payload, offset: nextOffset },
      hasMoreInSnapshot,
    }
  }

  /** Append a new ranked window; never replay IDs already in the session. */
  appendWindow(
    payload: FeedSessionPayload,
    newIds: string[],
    olderThan?: string | null
  ): FeedSessionPayload {
    const existing = new Set(payload.rankedIds)
    const appended: string[] = []
    for (const id of newIds) {
      if (existing.has(id)) continue
      existing.add(id)
      appended.push(id)
    }
    // Drop already-served prefix so the soft cap cannot truncate *new* IDs
    // (slice(0, CAP) on the full history was ending the feed around ~CAP cards).
    const offset = payload.offset ?? 0
    const unread = payload.rankedIds.slice(offset)
    let rankedIds = [...unread, ...appended]
    if (rankedIds.length > FEED_SESSION_RANKED_SOFT_CAP) {
      rankedIds = rankedIds.slice(rankedIds.length - FEED_SESSION_RANKED_SOFT_CAP)
    }
    return {
      ...payload,
      rankedIds,
      offset: 0,
      generation: (payload.generation ?? 0) + 1,
      olderThan: olderThan ?? payload.olderThan ?? null,
      corpusExhausted: appended.length === 0,
    }
  }

  reorderBySession<T extends { articleId: string }>(items: T[], session: FeedSessionPayload): T[] {
    const order = new Map(session.rankedIds.map((id, i) => [id, i]))
    return [...items].sort((a, b) => (order.get(a.articleId) ?? 9999) - (order.get(b.articleId) ?? 9999))
  }
}

export const feedSessionService = new FeedSessionService()
