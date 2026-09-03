/**
 * P18.3O — persistent seen / article-open / fresh-session no-replay.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FEED_SEEN_LOOKBACK_DAYS, FEED_IMPRESSION_CONFIG, GUEST_SEEN_STORAGE_KEY } from '@/lib/feed/config'
import {
  clearFeedRestore,
  consumePendingFeedRestore,
  saveFeedRestore,
} from '@/lib/feed/feedRestoration'
import { feedItemIdentityKeys } from '@/lib/feed/feedIdentity'
import type { FeedItemDto } from '@/types/smartFeed'

describe('P18.3O durable seen architecture', () => {
  it('keeps qualified impression gate unchanged', () => {
    expect(FEED_IMPRESSION_CONFIG.visibilityRatio).toBe(0.6)
    expect(FEED_IMPRESSION_CONFIG.minVisibleMs).toBe(750)
  })

  it('uses explicit 30-day lookback for durable exclusion', () => {
    expect(FEED_SEEN_LOOKBACK_DAYS).toBe(30)
  })

  it('separates article-open persistence from qualified impression counting', () => {
    const seen = readFileSync(join(process.cwd(), 'src/services/feed/FeedSeenService.ts'), 'utf8')
    expect(seen).toContain('recordArticleOpens')
    expect(seen).toContain('impressionCount: 0')
    expect(seen).toContain('FEED_SEEN_LOOKBACK_DAYS')
    expect(seen).toContain('orderBy(desc(userContentImpressions.lastSeenAt))')

    const telemetry = readFileSync(join(process.cwd(), 'src/app/api/feed/telemetry/route.ts'), 'utf8')
    expect(telemetry).toContain("eventType === 'article_opened'")
    expect(telemetry).toContain('recordArticleOpens')
    expect(telemetry).toContain('recordImpressions')

    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('article_opened')
    expect(client).toMatch(/onRead[\s\S]*writeGuestSeen/)
    expect(client).toMatch(/onRead[\s\S]*feedItemIdentityKeys/)
  })

  it('drops news FK so LEGACY_ALLOWED FS-only ids can persist', () => {
    const sql = readFileSync(
      join(process.cwd(), 'src/db/migrations/0038_phase_p18_3o_persistent_seen.sql'),
      'utf8'
    )
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "user_content_impressions_article_id_news_fk"')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "user_content_impressions_article_id_news_id_fk"')

    const schema = readFileSync(join(process.cwd(), 'src/db/schema/smartFeed.ts'), 'utf8')
    expect(schema).not.toMatch(/articleId:[\s\S]*\.references\(\(\) => news\.id/)
  })
})

describe('P18.3O fresh session vs back restore', () => {
  const memory = new Map<string, string>()

  beforeEach(() => {
    memory.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v)
      },
      removeItem: (k: string) => {
        memory.delete(k)
      },
    })
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memory.get(`local:${k}`) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(`local:${k}`, v)
      },
      removeItem: (k: string) => {
        memory.delete(`local:${k}`)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function card(id: string, clusterId: string | null = null): FeedItemDto {
    return {
      id,
      type: 'article',
      articleId: id,
      clusterId,
      publisher: null,
      headline: id,
      summary: null,
      category: null,
      image: null,
      video: null,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      breaking: false,
      materialUpdate: false,
      clusterSourceCount: 1,
      socialState: null,
      socialCounts: { likes: 0, comments: 0, saves: 0, shares: 0 },
      reason: 'RECENT',
      slug: id,
    }
  }

  it('CASE A: immediate back restore still finds snapshot card', () => {
    const items = Array.from({ length: 30 }, (_, i) => card(`a${i}`, `c${i}`))
    saveFeedRestore({
      mode: 'personal',
      articleId: 'a25',
      scrollIndex: 25,
      items,
      pending: true,
      timestamp: Date.now(),
    })
    const pending = consumePendingFeedRestore()
    expect(pending?.scrollIndex).toBe(25)
    expect(pending?.items?.[25]?.articleId).toBe('a25')
  })

  it('CASE B: app restart destroys ephemeral restore but keeps guest durable keys', () => {
    const items = Array.from({ length: 20 }, (_, i) => card(`s${i}`, `cl${i}`))
    // Session A: consume via Haberi Oku keys
    const durable = new Set<string>()
    for (const item of items.slice(0, 5)) {
      for (const k of feedItemIdentityKeys(item)) durable.add(k)
    }
    memory.set(`local:${GUEST_SEEN_STORAGE_KEY}`, JSON.stringify([...durable]))

    // Ephemeral restore present mid-session
    saveFeedRestore({
      mode: 'personal',
      articleId: 's2',
      scrollIndex: 2,
      items,
      pending: true,
      timestamp: Date.now(),
    })

    // Destroy ephemeral app state (sessionStorage) — keep localStorage durable
    for (const key of [...memory.keys()]) {
      if (!key.startsWith('local:')) memory.delete(key)
    }

    expect(consumePendingFeedRestore()).toBeNull()
    clearFeedRestore()

    const raw = memory.get(`local:${GUEST_SEEN_STORAGE_KEY}`)
    expect(raw).toBeTruthy()
    const persisted = new Set(JSON.parse(raw!) as string[])
    expect(persisted.has('s0')).toBe(true)
    expect(persisted.has('s4')).toBe(true)
    expect(persisted.has('cluster:cl1')).toBe(true)
    // Fresh session must exclude durable ids
    const freshPage = items.filter((i) => !feedItemIdentityKeys(i).some((k) => persisted.has(k)))
    expect(freshPage.map((i) => i.articleId)).not.toContain('s0')
    expect(freshPage.map((i) => i.articleId)).not.toContain('s2')
    expect(freshPage.length).toBe(15)
  })

  it('detail-open identity keys cover article + slug + cluster', () => {
    expect(feedItemIdentityKeys({ articleId: 'pg1', slug: 'slug-1', clusterId: 'c9' })).toEqual([
      'pg1',
      'slug-1',
      'cluster:c9',
    ])
  })
})
