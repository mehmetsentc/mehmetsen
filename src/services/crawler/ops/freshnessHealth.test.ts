import { describe, expect, it } from 'vitest'
import { computeFreshnessHealth } from './freshnessHealth'
import { MemoryCrawlerStore } from '../store/memory'
import { runCrawlerTick } from '../workers/tick'

describe('freshnessHealth', () => {
  const now = new Date('2026-08-20T12:00:00Z')

  it('stays GÜNCEL when publishers are quiet and queue is empty', () => {
    const h = computeFreshnessHealth({
      now,
      lastDiscoveryAt: new Date('2026-08-20T11:50:00Z'),
      lastFullScrapeAt: new Date('2026-08-20T11:51:00Z'),
      lastClusterAt: new Date('2026-08-20T11:51:30Z'),
      pendingFetch: 0,
      oldestPendingAt: null,
      newUrlsLast15m: 0,
      fullScrapesLast15m: 0,
      eventsLast15m: 0,
      sourceActivityLastHour: 0,
    })
    expect(h.status).toBe('GÜNCEL')
  })

  it('marks KRİTİK when sources are active but scrapes stalled with backlog', () => {
    const h = computeFreshnessHealth({
      now,
      lastDiscoveryAt: new Date('2026-08-20T10:00:00Z'),
      lastFullScrapeAt: new Date('2026-08-20T10:05:00Z'),
      lastClusterAt: new Date('2026-08-20T10:06:00Z'),
      pendingFetch: 80,
      oldestPendingAt: new Date('2026-08-20T10:00:00Z'),
      newUrlsLast15m: 12,
      fullScrapesLast15m: 0,
      eventsLast15m: 0,
      sourceActivityLastHour: 4,
    })
    expect(h.status).toBe('KRİTİK')
  })
})

describe('PAUSED pending terminal classify', () => {
  it('marks PAUSED source URLs FAILED with source_paused instead of leaving PENDING_FETCH', async () => {
    const store = new MemoryCrawlerStore()
    const paused = await store.insertSource({
      name: 'PausedSrc',
      domain: 'paused.test',
      baseUrl: 'https://paused.test',
      countryCode: 'TR',
      language: 'tr',
      status: 'PAUSED',
    })
    const active = await store.insertSource({
      name: 'ActiveSrc',
      domain: 'active.test',
      baseUrl: 'https://active.test',
      countryCode: 'TR',
      language: 'tr',
      status: 'ACTIVE',
      crawlIntervalSeconds: 300,
    })
    await store.updateSource(active.id, { nextDiscoveryAt: new Date('2026-08-21T00:00:00Z') })
    await store.insertDiscoveredUrl({
      sourceId: paused.id,
      url: 'https://paused.test/a',
      normalizedUrl: 'https://paused.test/a',
      urlHash: 'paused-a',
    })
    await store.insertDiscoveredUrl({
      sourceId: active.id,
      url: 'https://active.test/b',
      normalizedUrl: 'https://active.test/b',
      urlHash: 'active-b',
    })
    const pausedRow = [...store.urls.values()].find((u) => u.urlHash === 'paused-a')
    if (pausedRow) pausedRow.discoveredAt = new Date('2026-08-20T00:00:00Z')

    await runCrawlerTick({
      store,
      now: new Date('2026-08-20T12:00:00Z'),
      enabled: true,
      fetchImpl: async () =>
        new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        }),
    })

    const pausedUrl = [...store.urls.values()].find((u) => u.urlHash === 'paused-a')
    expect(pausedUrl?.status).toBe('FAILED')
    expect(pausedUrl?.failureReason).toBe('source_paused')
  })
})
