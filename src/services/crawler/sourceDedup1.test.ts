import { describe, expect, it } from 'vitest'
import { MemoryCrawlerStore } from '@/services/crawler/store/memory'
import { ingestDiscoveredArticle } from '@/services/crawler/ingestDiscoveredArticle'
import type { InsertRawArticleInput } from '@/services/crawler/store/types'

// SOURCE-DEDUP-1: proves the source-scoped article identity repair from SOURCE-DEDUP-0.
//
// Business rules under test (as specified by the phase brief):
//   1. SAME SOURCE + SAME ARTICLE            -> ingested only once.
//   2. DIFFERENT SOURCE + SAME EVENT         -> never suppressed as a same-source duplicate.
//   3. DIFFERENT SOURCE + IDENTICAL TEXT     -> raw evidence preserved, clustering-eligible,
//                                                still contributes to uniqueSourceCount.
//   4. Coverage must stay measurable for a future "Most Covered Events" feature.
//
// Tests A-L below cover: same-source exact-hash suppression (A, B), cross-source false-positive
// prevention (C, D, H), near-dup source scoping + time window + bounded cap (E, F, G), GUID
// early dedup and its source-scoping / safety guard (I, J, K), and the publish-lifecycle
// regression (L).

async function makeSource(store: MemoryCrawlerStore, name: string) {
  return store.insertSource({
    name,
    domain: `${name.toLowerCase()}.example.com`,
    baseUrl: `https://${name.toLowerCase()}.example.com`,
    countryCode: 'TR',
    language: 'tr',
    status: 'ACTIVE',
    priority: 50,
  })
}

function makeRawInput(overrides: Partial<InsertRawArticleInput> & { sourceId: string }): InsertRawArticleInput {
  return {
    discoveredUrlId: null,
    originalUrl: 'https://example.com/a',
    normalizedUrl: 'https://example.com/a',
    canonicalUrl: 'https://example.com/a',
    urlHash: 'hash-' + Math.random().toString(36).slice(2),
    title: 'Test Title',
    description: null,
    articleBodyText: 'Body text',
    articleBodyHtml: '<p>Body text</p>',
    author: null,
    publishedAt: null,
    modifiedAt: null,
    language: 'tr',
    countryCode: 'TR',
    region: null,
    city: null,
    district: null,
    mainImageUrl: null,
    imageUrls: [],
    videoUrls: [],
    wordCount: 2,
    charCount: 9,
    paragraphCount: 1,
    contentHash: 'content-hash-1',
    titleHash: 'title-hash-1',
    simhash: null,
    extractionMethod: 'readability',
    extractionConfidence: 0.9,
    httpStatus: 200,
    fetchDurationMs: 100,
    fetchedAt: new Date('2026-09-09T10:00:00Z'),
    ...overrides,
  }
}

describe('SOURCE-DEDUP-1: same-source exact-hash suppression still works', () => {
  it('A: findRawByContentHash finds a prior SAME-source article with the same content hash', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'SourceA')
    await store.insertRawArticle(makeRawInput({ sourceId: source.id, contentHash: 'shared-content' }))

    const found = await store.findRawByContentHash(source.id, 'shared-content')
    expect(found).not.toBeNull()
  })

  it('B: findRawByTitleHash finds a prior SAME-source article with the same title hash', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'SourceB')
    await store.insertRawArticle(makeRawInput({ sourceId: source.id, titleHash: 'shared-title' }))

    const found = await store.findRawByTitleHash(source.id, 'shared-title')
    expect(found).not.toBeNull()
  })
})

describe('SOURCE-DEDUP-1: cross-source false positive is fixed (Root Cause C)', () => {
  it('C: findRawByContentHash does NOT find a DIFFERENT source\'s article with the same content hash', async () => {
    const store = new MemoryCrawlerStore()
    const sourceX = await makeSource(store, 'AgencyFeedX')
    const sourceY = await makeSource(store, 'AgencyFeedY')
    // Two independent publishers running identical wire-copy text (e.g. agency release).
    await store.insertRawArticle(makeRawInput({ sourceId: sourceX.id, contentHash: 'agency-copy-hash' }))

    const foundForY = await store.findRawByContentHash(sourceY.id, 'agency-copy-hash')
    expect(foundForY).toBeNull()

    const foundForX = await store.findRawByContentHash(sourceX.id, 'agency-copy-hash')
    expect(foundForX).not.toBeNull()
  })

  it('D: findRawByTitleHash does NOT find a DIFFERENT source\'s article with the same title hash', async () => {
    const store = new MemoryCrawlerStore()
    const sourceX = await makeSource(store, 'WireX')
    const sourceY = await makeSource(store, 'WireY')
    await store.insertRawArticle(makeRawInput({ sourceId: sourceX.id, titleHash: 'agency-title-hash' }))

    const foundForY = await store.findRawByTitleHash(sourceY.id, 'agency-title-hash')
    expect(foundForY).toBeNull()
  })

  it('H: three different sources covering the same event all remain independent raw evidence (no suppression)', async () => {
    const store = new MemoryCrawlerStore()
    const s1 = await makeSource(store, 'Outlet1')
    const s2 = await makeSource(store, 'Outlet2')
    const s3 = await makeSource(store, 'Outlet3')
    const sharedContentHash = 'breaking-event-content'
    const sharedTitleHash = 'breaking-event-title'

    await store.insertRawArticle(
      makeRawInput({ sourceId: s1.id, contentHash: sharedContentHash, titleHash: sharedTitleHash })
    )
    await store.insertRawArticle(
      makeRawInput({ sourceId: s2.id, contentHash: sharedContentHash, titleHash: sharedTitleHash })
    )
    await store.insertRawArticle(
      makeRawInput({ sourceId: s3.id, contentHash: sharedContentHash, titleHash: sharedTitleHash })
    )

    // Every source's own scoped lookup must find only ITS OWN row -- none of the three
    // suppresses another, so all three remain eligible for clustering and for
    // uniqueSourceCount (a future "Most Covered Events" feature depends on this).
    for (const s of [s1, s2, s3]) {
      const byContent = await store.findRawByContentHash(s.id, sharedContentHash)
      expect(byContent).not.toBeNull()
      expect(byContent?.sourceId).toBe(s.id)
    }

    const allArticles = [...store.articles.values()].filter((a) => a.contentHash === sharedContentHash)
    expect(allArticles.length).toBe(3)
    expect(new Set(allArticles.map((a) => a.sourceId)).size).toBe(3)
  })
})

describe('SOURCE-DEDUP-1: near-duplicate candidate pool is source-scoped, time-bounded, and capped (Root Cause A)', () => {
  it('E: recentRawForNearDup never returns another source\'s articles', async () => {
    const store = new MemoryCrawlerStore()
    const sourceX = await makeSource(store, 'NearDupX')
    const sourceY = await makeSource(store, 'NearDupY')
    const now = new Date('2026-09-09T12:00:00Z')
    await store.insertRawArticle(makeRawInput({ sourceId: sourceY.id, fetchedAt: now }))

    const near = await store.recentRawForNearDup(sourceX.id, 40, now)
    expect(near.length).toBe(0)
  })

  it('F: recentRawForNearDup excludes same-source articles older than the configured window', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'NearDupWindow')
    const now = new Date('2026-09-09T12:00:00Z')
    const tooOld = new Date(now.getTime() - 200 * 60 * 60 * 1000) // 200h ago, outside default 72h window
    const recent = new Date(now.getTime() - 1 * 60 * 60 * 1000)
    await store.insertRawArticle(makeRawInput({ sourceId: source.id, fetchedAt: tooOld, urlHash: 'old' }))
    await store.insertRawArticle(makeRawInput({ sourceId: source.id, fetchedAt: recent, urlHash: 'new' }))

    const near = await store.recentRawForNearDup(source.id, 40, now)
    expect(near.length).toBe(1)
    expect(near[0].urlHash).toBe('new')
  })

  it('G: recentRawForNearDup is bounded and never exceeds the configured max candidate count', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'NearDupBounded')
    const now = new Date('2026-09-09T12:00:00Z')
    for (let i = 0; i < 60; i++) {
      await store.insertRawArticle(
        makeRawInput({ sourceId: source.id, fetchedAt: new Date(now.getTime() - i * 60_000), urlHash: `u${i}` })
      )
    }

    const near = await store.recentRawForNearDup(source.id, 500, now) // caller asks for way more than the cap
    expect(near.length).toBeLessThanOrEqual(40) // default nearDupMaxCandidates
  })
})

describe('SOURCE-DEDUP-1: RSS/Atom GUID early dedup (source-scoped)', () => {
  it('I: same source + same GUID under a different URL is treated as a duplicate', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'GuidSource')
    const guid = 'guid-00000001'

    const first = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://guidsource.example.com/news/a?utm_x=1',
      guid,
    })
    expect(first.status).toBe('inserted')

    const second = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://guidsource.example.com/news/a-slightly-different-link',
      guid,
    })
    expect(second.status).toBe('duplicate')
  })

  it('J: the SAME GUID from a DIFFERENT source is never treated as a duplicate', async () => {
    const store = new MemoryCrawlerStore()
    const sourceX = await makeSource(store, 'GuidX')
    const sourceY = await makeSource(store, 'GuidY')
    const guid = 'shared-guid-across-feeds' // pathological/misconfigured feed scenario

    const first = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: sourceX.id,
      originalUrl: 'https://guidx.example.com/news/a',
      guid,
    })
    expect(first.status).toBe('inserted')

    const second = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: sourceY.id,
      originalUrl: 'https://guidy.example.com/news/b',
      guid,
    })
    // Must NOT be suppressed: different source, so this is rule #2 (different source + same
    // event must never be suppressed), even though it happens to share a GUID string.
    expect(second.status).toBe('inserted')
  })

  it('K: a short/degenerate GUID (<8 chars) is ignored by the early-dedup guard', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'GuidShort')
    const guid = '123' // degenerate placeholder-style guid, below the safety length guard

    const first = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://guidshort.example.com/news/a',
      guid,
    })
    expect(first.status).toBe('inserted')

    const second = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://guidshort.example.com/news/b-different-url',
      guid,
    })
    // Short GUID must NOT trigger the early-dedup fallback -- a genuinely different URL with
    // no other identity match must still be ingested as new.
    expect(second.status).toBe('inserted')
  })
})

describe('SOURCE-DEDUP-1: publish lifecycle does not erase dedup identity (regression)', () => {
  it('L: a PUBLISHED article is still found by same-source hash lookups after publish', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'PublishRegression')
    const published = await store.insertRawArticle(
      makeRawInput({
        sourceId: source.id,
        contentHash: 'published-content-hash',
        titleHash: 'published-title-hash',
        editorialStatus: 'PUBLISHED',
        editorialNewsId: 'news_123',
      })
    )
    expect(published.editorialStatus).toBe('PUBLISHED')

    // A same-source re-fetch producing the identical hash later must still be recognized as
    // the same article (rule #1: same source + same article ingests only once), even though
    // the original has already gone through the editorial/publish lifecycle.
    const byContent = await store.findRawByContentHash(source.id, 'published-content-hash')
    const byTitle = await store.findRawByTitleHash(source.id, 'published-title-hash')
    expect(byContent?.id).toBe(published.id)
    expect(byTitle?.id).toBe(published.id)
  })
})
