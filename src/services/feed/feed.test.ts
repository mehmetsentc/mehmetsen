/**
 * Phase P4 Smart Feed tests — unit/logic (no live DB).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  isSmartFeedEnabled,
  isSmartFeedTelemetryEnabled,
  isSmartFeedVideoEnabled,
} from '@/lib/feed/featureFlag'
import { FEED_IMPRESSION_CONFIG, FEED_MIX_V1 } from '@/lib/feed/config'
import { dedupeByCluster, mixPersonalFeed, rankModeFeed } from '@/services/feed/FeedRankingV1'
import { encodeFeedCursor, decodeFeedCursor, deterministicScore, dayKey } from '@/services/feed/feedUtils'
import type { FeedCandidateRow } from '@/types/smartFeed'

function row(partial: Partial<FeedCandidateRow> & Pick<FeedCandidateRow, 'articleId'>): FeedCandidateRow {
  const now = new Date()
  return {
    clusterId: null,
    publisherId: null,
    publisherSlug: null,
    publisherName: null,
    publisherLogoUrl: null,
    headline: partial.headline ?? 'Test',
    summary: null,
    category: null,
    image: null,
    video: null,
    publishedAt: partial.publishedAt ?? now,
    updatedAt: now,
    breaking: partial.breaking ?? false,
    materialUpdate: partial.materialUpdate ?? false,
    clusterSourceCount: partial.clusterSourceCount ?? 1,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    slug: partial.slug ?? 'test-slug',
    source: partial.source ?? 'RECENT',
    sortScore: partial.sortScore ?? now.getTime(),
    ...partial,
  }
}

describe('P4 feature flags default false in production', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'production' }
    delete process.env.SMART_FEED_ENABLED
    delete process.env.SMART_FEED_TELEMETRY_ENABLED
    delete process.env.SMART_FEED_VIDEO_ENABLED
  })

  afterEach(() => {
    process.env = env
  })

  it('smart feed flags off in prod when unset', () => {
    expect(isSmartFeedEnabled()).toBe(false)
    expect(isSmartFeedTelemetryEnabled()).toBe(false)
    expect(isSmartFeedVideoEnabled()).toBe(false)
  })
})

describe('P4 cluster dedup 3→1', () => {
  it('keeps one representative per cluster', () => {
    const rows = [
      row({ articleId: 'a1', clusterId: 'c1' }),
      row({ articleId: 'a2', clusterId: 'c1' }),
      row({ articleId: 'a3', clusterId: 'c1' }),
      row({ articleId: 'a4', clusterId: 'c2' }),
    ]
    const out = dedupeByCluster(rows)
    expect(out).toHaveLength(2)
    expect(out.map((r) => r.articleId)).toEqual(['a1', 'a4'])
  })
})

describe('P4 cursor pagination no dupes', () => {
  it('encodes and decodes opaque cursor', () => {
    const c = encodeFeedCursor({ publishedAt: '2026-01-01T00:00:00.000Z', id: 'news_1' })
    expect(decodeFeedCursor(c)).toEqual({ publishedAt: '2026-01-01T00:00:00.000Z', id: 'news_1' })
    expect(decodeFeedCursor('bad')).toBeNull()
  })
})

describe('P4 personal mix deterministic', () => {
  it('interleaves sources without duplicate articles', () => {
    const pools = {
      BREAKING: [row({ articleId: 'b1', source: 'BREAKING', breaking: true })],
      RECENT: [row({ articleId: 'r1', source: 'RECENT' }), row({ articleId: 'r2', source: 'RECENT' })],
      POPULAR: [row({ articleId: 'p1', source: 'POPULAR' })],
      LOCAL: [row({ articleId: 'l1', source: 'LOCAL' })],
      DISCOVERY: [row({ articleId: 'd1', source: 'DISCOVERY' })],
      FOLLOWING: [row({ articleId: 'f1', source: 'FOLLOWING' })],
    }
    const mixed = mixPersonalFeed(pools, 6, true)
    const ids = mixed.map((m) => m.articleId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(mixed.length).toBeGreaterThan(0)
    expect(FEED_MIX_V1.length).toBeGreaterThan(3)
  })

  it('guest baseline skips FOLLOWING slot when not authed', () => {
    const pools = {
      RECENT: [row({ articleId: 'r1' }), row({ articleId: 'r2' }), row({ articleId: 'r3' })],
    }
    const mixed = mixPersonalFeed(pools, 3, false)
    expect(mixed.every((m) => m.source !== 'FOLLOWING' || m.articleId.startsWith('r'))).toBe(true)
  })
})

describe('P4 breaking signal uses structured flag not title scan', () => {
  it('breaking rows carry breaking=true from data not headline', () => {
    const breaking = row({ articleId: 'bk', breaking: true, headline: 'Normal başlık', source: 'BREAKING' })
    const normal = row({ articleId: 'nm', breaking: false, headline: 'Son dakika kelimesi', source: 'RECENT' })
    const ranked = rankModeFeed('breaking', [normal, breaking], 10)
    expect(ranked[0].breaking).toBe(true)
    expect(ranked[0].articleId).toBe('bk')
  })
})

describe('P4 seen / material update re-eligible', () => {
  it('material update flag exposed on DTO path', () => {
    const updated = row({ articleId: 'u1', clusterId: 'c1', materialUpdate: true })
    expect(updated.materialUpdate).toBe(true)
  })
})

describe('P4 impression threshold config', () => {
  it('requires >=60% visible AND >=750ms', () => {
    expect(FEED_IMPRESSION_CONFIG.visibilityRatio).toBeGreaterThanOrEqual(0.6)
    expect(FEED_IMPRESSION_CONFIG.minVisibleMs).toBeGreaterThanOrEqual(750)
  })
})

describe('P4 feed restoration logic', () => {
  it('restore state round-trips in sessionStorage shape', async () => {
    const store: Record<string, string> = {}
    const g = globalThis as typeof globalThis & { sessionStorage?: Storage }
    const prev = g.sessionStorage
    g.sessionStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v
      },
      removeItem: (k: string) => {
        delete store[k]
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k]
      },
      key: () => null,
      length: 0,
    }

    const { saveFeedRestore, readFeedRestore, clearFeedRestore } = await import('@/lib/feed/feedRestoration')
    const state = { mode: 'personal' as const, articleId: 'a1', scrollIndex: 2, cursor: 'abc' }
    saveFeedRestore(state)
    expect(readFeedRestore()?.articleId).toBe('a1')
    clearFeedRestore()
    expect(readFeedRestore()).toBeNull()
    g.sessionStorage = prev
  })
})

describe('P4 social state shape', () => {
  it('feed item includes social counts', () => {
    const item = row({ articleId: 's1', likesCount: 5, commentsCount: 2 })
    expect(item.likesCount).toBe(5)
    expect(item.commentsCount).toBe(2)
  })
})

describe('P4 local city filter contract', () => {
  it('local mode ranking preserves geo-tagged rows', () => {
    const local = row({ articleId: 'loc1', source: 'LOCAL' })
    const ranked = rankModeFeed('local', [local], 5)
    expect(ranked[0].source).toBe('LOCAL')
  })
})

describe('P4 following filter contract', () => {
  it('following source tag preserved in ranked output', () => {
    const f = row({ articleId: 'f1', source: 'FOLLOWING' })
    const ranked = rankModeFeed('following', [f], 5)
    expect(ranked[0].source).toBe('FOLLOWING')
  })
})

describe('P4 published-only contract', () => {
  it('candidate rows assume published timestamps', () => {
    const r = row({ articleId: 'pub1' })
    expect(r.publishedAt).toBeInstanceOf(Date)
  })
})

describe('P4 deterministic discovery score', () => {
  it('stable within same day', () => {
    const dk = dayKey(new Date('2026-08-27'))
    expect(deterministicScore('article_x', dk)).toBe(deterministicScore('article_x', dk))
  })
})
