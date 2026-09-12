import { describe, expect, it } from 'vitest'
import { MemoryCrawlerStore } from '@/services/crawler/store/memory'
import { ingestDiscoveredArticle } from '@/services/crawler/ingestDiscoveredArticle'
import { runArticleBulk } from '@/services/crawler/editorial/bulk'
import { executeProtectedCleanup } from '@/services/crawler/ops/cleanupExecute'
import { runCrawlerTick } from '@/services/crawler/workers/tick'
import { runClusterTick } from '@/services/crawler/cluster/worker'
import { resetPolitenessForTests } from '@/services/crawler/http/politeness'
import { resetRobotsCacheForTests } from '@/services/crawler/http/robots'
import { urlHashFor, normalizeArticleUrl } from '@/services/crawler/url/normalize'
import type { InsertRawArticleInput } from '@/services/crawler/store/types'
import type { CmsRole } from '@/types/cms'
import type { NewsSourceRecord } from '@/services/crawler/types'

const NOW = new Date('2026-09-13T00:00:00Z')
const admin: { uid: string; role: CmsRole; email: string } = {
  uid: 'sa_1',
  role: 'super_admin',
  email: 'editor@nahaber.com',
}

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>First</title><link>https://news.test/first</link></item>
<item><title>First again</title><link>https://news.test/first?utm_source=rss&utm_medium=feed</link></item>
</channel></rss>`

function articleHtml(title: string) {
  return `<!doctype html><html lang="en"><head>
<script type="application/ld+json">${JSON.stringify({
    '@type': 'NewsArticle',
    headline: title,
    datePublished: '2026-09-13T00:00:00Z',
    articleBody:
      'The city council approved the measure after hours of debate. Officials said implementation starts next month for every district office. Residents were asked to follow published guidance and attend the follow-up hearing.',
  })}</script>
</head><body><article><p>The city council approved the measure after hours of debate.</p>
<p>Officials said implementation starts next month for every district office.</p>
<p>Residents were asked to follow published guidance and attend the follow-up hearing.</p></article></body></html>`
}

function mockFetch(bodies: Record<string, { status?: number; body?: string }>): typeof fetch {
  return async (input) => {
    const url = String(input)
    const key = url.split('?')[0]
    if (key.endsWith('/robots.txt')) {
      return new Response('User-agent: *\nAllow: /\n', { status: 200 })
    }
    const hit = bodies[key] || bodies[url]
    if (!hit) return new Response('missing', { status: 404 })
    return new Response(hit.body ?? '', { status: hit.status ?? 200 })
  }
}

async function makeSource(store: MemoryCrawlerStore, name: string, domain = `${name.toLowerCase()}.example.com`) {
  return store.insertSource({
    name,
    domain,
    baseUrl: `https://${domain}`,
    countryCode: 'TR',
    language: 'tr',
    status: 'ACTIVE',
    city: 'İstanbul',
  })
}

function rawInput(
  source: NewsSourceRecord,
  title: string,
  opts?: Partial<InsertRawArticleInput>
): InsertRawArticleInput {
  const url = opts?.originalUrl || `https://${source.domain}/${title}`
  const normalized = opts?.normalizedUrl || url
  return {
    sourceId: source.id,
    discoveredUrlId: opts?.discoveredUrlId ?? null,
    originalUrl: url,
    normalizedUrl: normalized,
    canonicalUrl: opts?.canonicalUrl ?? normalized,
    urlHash: opts?.urlHash || urlHashFor(normalized),
    title,
    description: title,
    articleBodyText: `${title} body text for clustering overlap tokens istanbul yangin`,
    articleBodyHtml: `<p>${title}</p>`,
    author: null,
    publishedAt: NOW,
    modifiedAt: null,
    language: 'tr',
    countryCode: 'TR',
    region: null,
    city: 'İstanbul',
    district: null,
    mainImageUrl: null,
    imageUrls: [],
    videoUrls: [],
    wordCount: 40,
    charCount: 200,
    paragraphCount: 1,
    contentHash: opts?.contentHash || `c-${title}`,
    titleHash: opts?.titleHash || `t-${title}`,
    simhash: null,
    extractionMethod: 'readability',
    extractionConfidence: 0.9,
    httpStatus: 200,
    fetchDurationMs: 10,
    fetchedAt: NOW,
    ...opts,
  }
}

describe('permanent URL memory after raw delete', () => {
  it('TEST 1 — delete then re-discover does not recreate the raw article', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'Milliyet', 'news.test')
    await store.updateSource(source.id, {
      discoveryMethod: 'RSS',
      rssUrls: ['https://news.test/rss.xml'],
      nextDiscoveryAt: new Date(0),
      crawlIntervalSeconds: 60,
    })
    process.env.NEWS_CRAWLER_MIN_INTERVAL_MS = '0'
    resetPolitenessForTests()
    resetRobotsCacheForTests()
    const fetchImpl = mockFetch({
      'https://news.test/rss.xml': { body: RSS },
      'https://news.test/first': { body: articleHtml('First story') },
    })
    const lookup = async () => ['93.184.216.34']

    await runCrawlerTick({
      store,
      fetchImpl,
      lookup,
      enabled: true,
      now: NOW,
    })
    const before = [...store.articles.values()]
    expect(before.length).toBe(1)
    const article = before[0]
    const urlCount = store.urls.size
    expect(urlCount).toBe(1)

    const deleted = await runArticleBulk({ store, actor: admin, op: 'delete', ids: [article.id] })
    if ('error' in deleted) throw new Error(deleted.error)
    expect(deleted.hardDeleted + deleted.tombstoned).toBe(1)
    const afterDelete = await store.getRawArticle(article.id)
    if (deleted.hardDeleted) expect(afterDelete).toBeNull()
    else expect(afterDelete?.editorialStatus).toBe('DELETED')
    expect(store.urls.size).toBe(urlCount)

    await store.updateSource(source.id, { nextDiscoveryAt: new Date(0), status: 'ACTIVE' })
    const again = await runCrawlerTick({
      store,
      fetchImpl,
      lookup,
      enabled: true,
      now: new Date(NOW.getTime() + 5 * 60_000),
    })
    expect(again.urlsInserted).toBe(0)
    expect([...store.articles.values()].filter((a) => a.editorialStatus !== 'DELETED')).toHaveLength(0)
    expect(store.urls.size).toBe(urlCount)
    const hash = urlHashFor(normalizeArticleUrl('https://news.test/first')!)
    expect(await store.getDiscoveredByHash(hash)).not.toBeNull()
  })

  it('TEST 1b — cleanup after delete still skips the same source URL', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'Sozcu')
    const url = 'https://sozcu.example.com/haber/123'
    const first = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: url,
    })
    expect(first.status).toBe('inserted')
    const discovered = await store.getDiscoveredByHash(first.urlHash!)
    const raw = await store.insertRawArticle(
      rawInput(source, 'haber-123', { discoveredUrlId: discovered!.id, originalUrl: url, normalizedUrl: url })
    )
    const del = await runArticleBulk({ store, actor: admin, op: 'delete', ids: [raw.id] })
    if ('error' in del) throw new Error(del.error)
    await executeProtectedCleanup(store, { actorId: admin.uid, actorRole: 'super_admin' })
    expect(store.urls.size).toBe(1)

    const rediscover = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: url,
    })
    expect(rediscover.status).toBe('duplicate')
    expect([...store.articles.values()].some((a) => a.editorialStatus === 'NEW' && a.id !== raw.id)).toBe(false)
  })

  it('TEST 2 — repeated RSS ticks ingest the URL once', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'Hurriyet')
    const url = 'https://hurriyet.example.com/a'
    for (let i = 0; i < 5; i += 1) {
      const result = await ingestDiscoveredArticle(store, {
        discoveryType: 'RSS',
        sourceId: source.id,
        originalUrl: url,
      })
      if (i === 0) expect(result.status).toBe('inserted')
      else expect(result.status).toBe('duplicate')
    }
    expect(store.urls.size).toBe(1)
  })

  it('TEST 3 — tracking parameters collapse to one discovery identity', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'BBC')
    const first = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://bbc.example.com/news/123',
    })
    const tracked = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://bbc.example.com/news/123?utm_source=twitter&utm_campaign=x&fbclid=abc&gclid=1',
    })
    expect(first.status).toBe('inserted')
    expect(tracked.status).toBe('duplicate')
    expect(first.urlHash).toBe(tracked.urlHash)
    expect(store.urls.size).toBe(1)
  })

  it('TEST 4 — different sources covering the same event both keep provenance', async () => {
    const store = new MemoryCrawlerStore()
    const milliyet = await makeSource(store, 'Milliyet', 'milliyet.example.com')
    const sozcu = await makeSource(store, 'Sozcu', 'sozcu.example.com')
    const a = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: milliyet.id,
      originalUrl: 'https://milliyet.example.com/event-a',
    })
    const b = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: sozcu.id,
      originalUrl: 'https://sozcu.example.com/event-a',
    })
    expect(a.status).toBe('inserted')
    expect(b.status).toBe('inserted')
    const rawA = await store.insertRawArticle(
      rawInput(milliyet, "Manisa'da makilik alanda yangın", {
        discoveredUrlId: (await store.getDiscoveredByHash(a.urlHash!))!.id,
        originalUrl: 'https://milliyet.example.com/event-a',
        normalizedUrl: 'https://milliyet.example.com/event-a',
      })
    )
    const rawB = await store.insertRawArticle(
      rawInput(sozcu, "Manisa'da makilik alanda yangın", {
        discoveredUrlId: (await store.getDiscoveredByHash(b.urlHash!))!.id,
        originalUrl: 'https://sozcu.example.com/event-a',
        normalizedUrl: 'https://sozcu.example.com/event-a',
      })
    )
    expect(rawA.id).not.toBe(rawB.id)
    await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    const clustered = [...store.articles.values()].filter((row) => row.clusterId)
    expect(clustered.length).toBeGreaterThanOrEqual(1)
  })

  it('TEST 5 — deleting one member of a multi-source cluster leaves the other provenance', async () => {
    const store = new MemoryCrawlerStore()
    const milliyet = await makeSource(store, 'Milliyet2', 'm2.example.com')
    const sozcu = await makeSource(store, 'Sozcu2', 's2.example.com')
    const a = await store.insertRawArticle(rawInput(milliyet, 'shared-event-a'))
    const b = await store.insertRawArticle(rawInput(sozcu, 'shared-event-b'))
    const cluster = await store.insertCluster({
      representativeArticleId: a.id,
      normalizedTopic: 'shared-event',
      countryCode: 'TR',
      city: 'İstanbul',
    })
    await store.updateRawArticle(a.id, { clusterId: cluster.id })
    await store.updateRawArticle(b.id, { clusterId: cluster.id })
    await store.insertMembership({
      clusterId: cluster.id,
      articleId: a.id,
      sourceId: milliyet.id,
      similarityScore: 1,
      matchBand: 'HIGH',
    })
    await store.insertMembership({
      clusterId: cluster.id,
      articleId: b.id,
      sourceId: sozcu.id,
      similarityScore: 0.9,
      matchBand: 'HIGH',
    })

    const del = await runArticleBulk({ store, actor: admin, op: 'delete', ids: [a.id] })
    if ('error' in del) throw new Error(del.error)
    expect(del.tombstoned).toBe(1)
    expect((await store.getRawArticle(a.id))?.editorialStatus).toBe('DELETED')
    expect(await store.getRawArticle(b.id)).toBeTruthy()
    expect((await store.getRawArticle(b.id))?.editorialStatus).not.toBe('DELETED')
    expect(await store.getCluster(cluster.id)).toBeTruthy()
    expect(await store.getMembershipByArticle(b.id)).toBeTruthy()
  })

  it('TEST 6 — reject/archive/publish lifecycle does not make the URL NEW again', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'Ntv')
    const url = 'https://ntv.example.com/seen'
    const ingested = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: url,
    })
    const discovered = await store.getDiscoveredByHash(ingested.urlHash!)
    const raw = await store.insertRawArticle(
      rawInput(source, 'lifecycle', {
        discoveredUrlId: discovered!.id,
        originalUrl: url,
        normalizedUrl: url,
      })
    )

    const rejected = await runArticleBulk({
      store,
      actor: admin,
      op: 'reject',
      ids: [raw.id],
      reason: 'DUPLICATE',
    })
    if ('error' in rejected) throw new Error(rejected.error)
    expect((await ingestDiscoveredArticle(store, { discoveryType: 'RSS', sourceId: source.id, originalUrl: url })).status).toBe(
      'duplicate'
    )

    await store.updateRawArticle(raw.id, { editorialStatus: 'ARCHIVED' })
    expect((await ingestDiscoveredArticle(store, { discoveryType: 'RSS', sourceId: source.id, originalUrl: url })).status).toBe(
      'duplicate'
    )

    await store.updateRawArticle(raw.id, { editorialStatus: 'PUBLISHED', editorialNewsId: 'news_1' })
    expect((await ingestDiscoveredArticle(store, { discoveryType: 'RSS', sourceId: source.id, originalUrl: url })).status).toBe(
      'duplicate'
    )
  })

  it('raw row without discoveredUrlId still leaves a URL tombstone after hard delete', async () => {
    const store = new MemoryCrawlerStore()
    const source = await makeSource(store, 'OrphanLink')
    const url = 'https://orphanlink.example.com/x'
    const raw = await store.insertRawArticle(rawInput(source, 'orphan-x', { originalUrl: url, normalizedUrl: url }))
    expect(raw.discoveredUrlId).toBeNull()
    const del = await runArticleBulk({ store, actor: admin, op: 'delete', ids: [raw.id] })
    if ('error' in del) throw new Error(del.error)
    expect(del.hardDeleted).toBe(1)
    expect(store.urls.size).toBe(1)
    const again = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: url,
    })
    expect(again.status).toBe('duplicate')
  })
})
