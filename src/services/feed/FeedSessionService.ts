import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import type { FeedMode } from '@/types/smartFeed'

export interface FeedSessionPayload {
  sessionId: string
  seed: number
  mode: FeedMode
  rankedIds: string[]
  createdAt: number
  offset: number
}

function sessionSecret(): string {
  return process.env.FEED_SESSION_SECRET?.trim() || 'nahaber-dev-feed-session-v1'
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url')
}

export class FeedSessionService {
  create(mode: FeedMode, rankedIds: string[], seed?: number): FeedSessionPayload {
    return {
      sessionId: randomUUID(),
      seed: seed ?? Math.floor(Math.random() * 1_000_000),
      mode,
      rankedIds,
      createdAt: Date.now(),
      offset: 0,
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

  slicePage(payload: FeedSessionPayload, limit: number): {
    ids: string[]
    nextPayload: FeedSessionPayload | null
    hasMore: boolean
  } {
    const start = payload.offset ?? 0
    const ids = payload.rankedIds.slice(start, start + limit)
    const nextOffset = start + ids.length
    const hasMore = nextOffset < payload.rankedIds.length
    return {
      ids,
      nextPayload: hasMore ? { ...payload, offset: nextOffset } : null,
      hasMore,
    }
  }

  reorderBySession<T extends { articleId: string }>(items: T[], session: FeedSessionPayload): T[] {
    const order = new Map(session.rankedIds.map((id, i) => [id, i]))
    return [...items].sort((a, b) => (order.get(a.articleId) ?? 9999) - (order.get(b.articleId) ?? 9999))
  }
}

export const feedSessionService = new FeedSessionService()
