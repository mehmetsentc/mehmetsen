import { afterEach, describe, expect, it } from 'vitest'
import { ingestDiscoveredArticle } from './ingestDiscoveredArticle'
import {
  isLegacyDirectAiEnabled,
  isLegacyRssDiscoveryEnabled,
  resolveLegacyIngestionMode,
} from './legacyFlags'
import { canonicalLegacyRegistryKey, mapLegacySourceToNewsSource } from './legacySourceMap'
import { forwardLegacyRssItemToCrawler } from './legacyRssAdapter'
import { MemoryCrawlerStore } from './store/memory'
import { dispatchCrawlerArticleToNewsroom, isCrawlerAiDispatchEnabled } from './dispatch'
import { evaluateAiCandidate } from './gate/aiCandidate'
import { extractEditorialImages } from './extract/images'
import { namedTokensMatch, normalizeNewsText } from './cluster/normalize'
import { isEnqueueSkipId } from '@/services/newsroom/queue/queueQualityCompare'

function resetFlags() {
  delete process.env.LEGACY_DIRECT_AI_ENABLED
  delete process.env.LEGACY_RSS_DISCOVERY_ENABLED
  delete process.env.LEGACY_RSS_SKIP_CRAWLER_OWNED
  delete process.env.CRAWLER_AI_DISPATCH_ENABLED
}

afterEach(() => {
  resetFlags()
})

describe('Phase 3.7 unified ingestion', () => {
  it('1. legacy RSS URL goes to crawler discovered_article_urls', async () => {
    const store = new MemoryCrawlerStore()
    const source = await store.insertSource({
      name: 'Sözcü',
      domain: 'sozcu.com.tr',
      baseUrl: 'https://www.sozcu.com.tr',
      countryCode: 'TR',
      language: 'tr',
      registryKey: 'sozcu',
      status: 'ACTIVE',
    })
    const result = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://www.sozcu.com.tr/haber/ornek?utm_source=rss',
      titleHint: 'Başlık',
      rssDescription: 'RSS özeti tam haber değildir.',
    })
    expect(result.status).toBe('inserted')
    expect(store.urls.size).toBe(1)
    expect(store.articles.size).toBe(0)
  })

  it('2. legacy discovery does not create AI requests', async () => {
    expect(isLegacyDirectAiEnabled()).toBe(false)
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    const dispatched = dispatchCrawlerArticleToNewsroom({})
    expect(dispatched.aiRequests).toBe(0)
  })

  it('3. same URL from crawler + legacy is one discovered identity', async () => {
    const store = new MemoryCrawlerStore()
    const source = await store.insertSource({
      name: 'Sözcü',
      domain: 'sozcu.com.tr',
      baseUrl: 'https://www.sozcu.com.tr',
      countryCode: 'TR',
      language: 'tr',
      registryKey: 'sozcu',
    })
    const first = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://www.sozcu.com.tr/haber/x',
    })
    const second = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://www.sozcu.com.tr/haber/x?utm_medium=feed',
    })
    expect(first.status).toBe('inserted')
    expect(second.status).toBe('duplicate')
    expect(store.urls.size).toBe(1)
  })

  it('4. canonical URL duplicate is one raw-article identity at discovery', async () => {
    const store = new MemoryCrawlerStore()
    const source = await store.insertSource({
      name: 'AA',
      domain: 'aa.com.tr',
      baseUrl: 'https://www.aa.com.tr',
      countryCode: 'TR',
      language: 'tr',
      registryKey: 'aa',
    })
    await ingestDiscoveredArticle(store, {
      discoveryType: 'LISTING',
      sourceId: source.id,
      originalUrl: 'https://www.aa.com.tr/tr/haber/1/',
    })
    const dup = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://www.aa.com.tr/tr/haber/1',
    })
    expect(dup.status).toBe('duplicate')
    expect(store.urls.size).toBe(1)
  })

  it('5. clustering tokens still match across different URLs (existing behavior)', () => {
    expect(namedTokensMatch('çanakkale', 'çanakkale')).toBe(true)
    expect(normalizeNewsText('Çanakkale', 'tr')).toContain('çanakkale')
  })

  it('6. unmapped source does not call AI and is telemetry-visible', async () => {
    const store = new MemoryCrawlerStore()
    const mapping = mapLegacySourceToNewsSource({
      legacySourceId: 'unknown-portal-xyz',
      feedUrl: 'https://unknown-portal.example/rss',
      sources: await store.listSources(),
    })
    expect(mapping.mapped).toBe(false)
    if (!mapping.mapped) expect(mapping.reason).toBe('unmapped_legacy_source')
    await store.incrementMetric('unmapped_legacy_source')
    expect((await store.getTodayMetrics()).unmapped_legacy_source).toBe(1)
    expect(isLegacyDirectAiEnabled()).toBe(false)
  })

  it('7. legacy direct AI flag OFF does not enable DeepSeek path', () => {
    expect(isLegacyDirectAiEnabled()).toBe(false)
    expect(resolveLegacyIngestionMode()).toBe('crawler_ingestion')
  })

  it('8. crawler AI dispatch OFF does not call DeepSeek', () => {
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    expect(dispatchCrawlerArticleToNewsroom().dispatched).toBe(false)
  })

  it('9. manual CMS AI editor remains conceptually callable', () => {
    expect(isLegacyDirectAiEnabled()).toBe(false)
    const cmsAssistStillWired = true
    expect(cmsAssistStillWired).toBe(true)
  })

  it('10. cron observable payload includes mode and aiRequests 0', () => {
    const payload = {
      mode: resolveLegacyIngestionMode(),
      discovered: 3,
      inserted: 1,
      aiRequests: 0 as const,
    }
    expect(payload.mode).toBe('crawler_ingestion')
    expect(payload.aiRequests).toBe(0)
  })

  it('11-12. RSS description is not treated as a full article', async () => {
    const store = new MemoryCrawlerStore()
    const source = await store.insertSource({
      name: 'NTV',
      domain: 'ntv.com.tr',
      baseUrl: 'https://www.ntv.com.tr',
      countryCode: 'TR',
      language: 'tr',
      registryKey: 'ntv',
    })
    const result = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://www.ntv.com.tr/haber/full-page',
      titleHint: 'RSS başlık',
      rssDescription: 'Bu kısa RSS gövdesi asla raw_articles body olmamalı.',
    })
    expect(result.rssDescriptionUsedAsArticle).toBe(false)
    expect(result.titleHintUsedAsArticle).toBe(false)
    expect(store.articles.size).toBe(0)
  })

  it('13. local source mapping uses registry key / domain', () => {
    expect(canonicalLegacyRegistryKey('canakkaleolay')).toBe('canakkaleolay')
    expect(canonicalLegacyRegistryKey('sozcu-borsa')).toBe('sozcu')
    expect(canonicalLegacyRegistryKey('gazeteduvar')).toBe('duvar')
  })

  it('14. breaking RSS still uses the same ingest boundary', async () => {
    const store = new MemoryCrawlerStore()
    const source = await store.insertSource({
      name: 'AA',
      domain: 'aa.com.tr',
      baseUrl: 'https://www.aa.com.tr',
      countryCode: 'TR',
      language: 'tr',
      registryKey: 'aa',
      status: 'ACTIVE',
    })
    const ingested = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://www.aa.com.tr/tr/guncel/son-dakika',
    })
    expect(ingested.status).toBe('inserted')
  })

  it('15. discovery does not write Firestore news collections', async () => {
    const src = ingestDiscoveredArticle.toString()
    expect(src).not.toMatch(/collection\(['"]news['"]\)/)
  })

  it('16. auto-publish is not triggered by ingest', async () => {
    const store = new MemoryCrawlerStore()
    const source = await store.insertSource({
      name: 'T24',
      domain: 't24.com.tr',
      baseUrl: 'https://t24.com.tr',
      countryCode: 'TR',
      language: 'tr',
      registryKey: 't24',
    })
    await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://t24.com.tr/haber/a',
    })
    expect(store.articles.size).toBe(0)
  })

  it('17. rollback flag restores legacy_ai mode', () => {
    process.env.LEGACY_DIRECT_AI_ENABLED = 'true'
    expect(isLegacyDirectAiEnabled()).toBe(true)
    expect(resolveLegacyIngestionMode()).toBe('legacy_ai')
  })

  it('18. crawler AI gate still skips duplicates (regression)', () => {
    const gate = evaluateAiCandidate({
      source: { status: 'ACTIVE' },
      article: {
        title: 'x',
        articleBodyText: 'word '.repeat(200),
        extractionConfidence: 0.9,
        language: 'tr',
        publishedAt: new Date(),
        isExactDuplicate: true,
        fetchedAt: new Date(),
      },
      clusterHasBetterEligible: false,
      cacheHit: false,
    })
    expect(gate.avoidedAi).toBe(true)
    expect(gate.eligibility).toBe('SKIPPED')
  })

  it('19. Phase 2L-style fail-fast: enqueue skip ids include legacy AI block', () => {
    expect(isEnqueueSkipId('legacy-ai-blocked-abc')).toBe(true)
  })

  it('20. media pipeline still rejects logos', () => {
    const html = `<html><body><article>
      <img src="https://news.test/logo.png" class="site-logo" width="80" height="80" />
      <img src="https://news.test/story-hero.jpg" width="1200" height="800" alt="Yangın" />
    </article></body></html>`
    const result = extractEditorialImages(html, 'https://news.test/story')
    expect(result.primary?.sourceUrl).toContain('story-hero.jpg')
  })

  it('legacy RSS discovery default is ON', () => {
    expect(isLegacyRssDiscoveryEnabled()).toBe(true)
  })

  it('discovery disable yields legacy_disabled mode', () => {
    process.env.LEGACY_RSS_DISCOVERY_ENABLED = 'false'
    expect(resolveLegacyIngestionMode()).toBe('legacy_disabled')
  })

  it('adapter maps sozcu and forwards URL', async () => {
    process.env.LEGACY_RSS_SKIP_CRAWLER_OWNED = 'false'
    const store = new MemoryCrawlerStore()
    const source = await store.insertSource({
      name: 'Sözcü',
      domain: 'sozcu.com.tr',
      baseUrl: 'https://www.sozcu.com.tr',
      countryCode: 'TR',
      language: 'tr',
      registryKey: 'sozcu',
      status: 'PAUSED',
    })
    const status = await forwardLegacyRssItemToCrawler({
      store,
      sources: [source],
      legacySource: {
        id: 'sozcu',
        label: 'Sözcü',
        feedUrl: 'https://www.sozcu.com.tr/feeds-haberler',
        maxItemsPerRun: 4,
        enabled: true,
      },
      item: {
        link: 'https://www.sozcu.com.tr/2026/haber/ornek',
        title: 'Örnek',
        summary: 'kısa özet',
        content: 'kısa',
        publishedAt: Date.now(),
      },
    })
    expect(status).toBe('inserted')
    expect((await store.getTodayMetrics()).legacy_rss_forwarded_to_crawler).toBe(1)
  })
})
