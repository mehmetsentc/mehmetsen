import { describe, expect, it } from 'vitest'
import { ingestDiscoveredArticle } from './ingestDiscoveredArticle'
import { parseRssFeed } from './discovery/rss'
import { extractArticle } from './extract/pipeline'
import { extractEditorialImages } from './extract/images'
import { MAX_DEFAULT_EXTRAS, MAX_GALLERY_EXTRAS } from './extract/imageNormalize'
import { evaluateExtractionQuality } from './gate/quality'
import { buildEventFingerprint } from './cluster/fingerprint'
import { scoreClusterMatch } from './cluster/score'
import { detectMaterialUpdate, selectPrimaryArticle } from './cluster/canonical'
import { assignMembershipRole, futureAiUnitsForEvent, independentSourceCount } from './cluster/roles'
import { runClusterTick } from './cluster/worker'
import { buildEventAiPack } from './aiDispatch/pack'
import { dispatchCrawlerArticleToNewsroom, isCrawlerAiDispatchEnabled } from './dispatch'
import { isLegacyDirectAiEnabled } from './legacyFlags'
import { MemoryCrawlerStore } from './store/memory'
import { matchesRawArticleQuery, numberedPages, ACTIVE_EDITORIAL_STATUSES } from './editorial/query'
import { buildCrawlerCronSummaries } from './ops/cronSummary'
import { cronAuditByClass, CRON_CLASS_B, classifyCronPath } from './ops/cronClassification'
import { PUBLISHED_BLOCKS_FOLLOWUP } from './ops/publishedBlocksFollowup'
import type { InsertRawArticleInput } from './store/types'
import type { MemberEvidence } from './aiDispatch/types'
import type { NewsSourceRecord, RawArticleRecord } from './types'

const NOW = new Date('2026-08-19T12:00:00Z')

async function seedSource(store: MemoryCrawlerStore, name: string, domain: string, extra?: Partial<NewsSourceRecord>) {
  return store.insertSource({
    name,
    domain,
    baseUrl: `https://${domain}`,
    countryCode: 'TR',
    language: 'tr',
    status: 'ACTIVE',
    geographicScope: 'NATIONAL',
    qualityTier: 'TIER_A',
    healthScore: 80,
    city: extra?.city || 'Manisa',
    district: extra?.district || null,
    ...extra,
  })
}

async function seedArticle(
  store: MemoryCrawlerStore,
  source: NewsSourceRecord,
  title: string,
  opts?: Partial<InsertRawArticleInput>
) {
  return store.insertRawArticle({
    sourceId: source.id,
    discoveredUrlId: null,
    originalUrl: `https://${source.domain}/${encodeURIComponent(title).slice(0, 24)}`,
    normalizedUrl: `https://${source.domain}/${encodeURIComponent(title).slice(0, 24)}`,
    canonicalUrl: `https://${source.domain}/${encodeURIComponent(title).slice(0, 24)}`,
    urlHash: `${source.id}-${title}`,
    title,
    description: title,
    articleBodyText: `${title}. Ekipler bölgede. ${'haber gövdesi kelime '.repeat(40)}`,
    articleBodyHtml: `<p>${title}</p>`,
    author: null,
    publishedAt: NOW,
    modifiedAt: null,
    language: 'tr',
    countryCode: 'TR',
    region: source.region,
    city: source.city,
    district: source.district,
    mainImageUrl: 'https://cdn.test/hero.jpg',
    imageUrls: ['https://cdn.test/hero.jpg'],
    videoUrls: [],
    wordCount: 220,
    charCount: 1400,
    paragraphCount: 4,
    contentHash: opts?.contentHash || `h-${source.id}-${title}`,
    titleHash: `t-${title}`,
    simhash: null,
    extractionMethod: 'semantic-html',
    extractionConfidence: 0.9,
    httpStatus: 200,
    fetchDurationMs: 80,
    fetchedAt: NOW,
    clusterStatus: 'PENDING',
    qualityStatus: 'GOOD',
    ...opts,
  })
}

function memberEvidence(article: RawArticleRecord, source: NewsSourceRecord): MemberEvidence {
  return {
    articleId: article.id,
    sourceId: source.id,
    sourceName: source.name,
    qualityTier: source.qualityTier,
    healthScore: source.healthScore,
    extractionConfidence: article.extractionConfidence,
    publishedAt: article.publishedAt,
    fetchedAt: article.fetchedAt,
    title: article.title,
    body: article.articleBodyText,
    description: article.description,
    contentHash: article.contentHash,
    wordCount: article.wordCount,
    isExactDuplicate: article.isExactDuplicate,
    editorialStatus: article.editorialStatus,
    editorialNewsId: article.editorialNewsId,
    sourceStatus: source.status,
  }
}

describe('Phase 4A.4 unified discovery extraction event pipeline', () => {
  it('A. RSS article goes to URL inbox', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store, 'Cumhuriyet', 'cumhuriyet.com.tr')
    const result = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      discoveryLane: 'LEGACY_ADAPTER',
      sourceId: source.id,
      originalUrl: 'https://www.cumhuriyet.com.tr/haber/manisa-yangin?utm_source=rss',
      titleHint: "Manisa’da makilik alanda yangın",
      rssDescription: 'RSS özeti tam haber değildir.',
    })
    expect(result.status).toBe('inserted')
    expect(result.rssDescriptionUsedAsArticle).toBe(false)
    expect(store.urls.size).toBe(1)
    expect(store.articles.size).toBe(0)
    const url = [...store.urls.values()][0]
    expect(url.normalizedUrl).toBe('https://www.cumhuriyet.com.tr/haber/manisa-yangin')
    expect(url.discoveryLane).toBe('LEGACY_ADAPTER')
    expect(url.status).toBe('PENDING_FETCH')
  })

  it('B. RSS + crawler same URL is one extraction job with both lanes', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store, 'Evrensel', 'evrensel.net')
    const first = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      discoveryLane: 'LEGACY_ADAPTER',
      sourceId: source.id,
      originalUrl: 'https://www.evrensel.net/haber/manisa',
    })
    const second = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      discoveryLane: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://www.evrensel.net/haber/manisa?utm_medium=feed',
    })
    expect(first.status).toBe('inserted')
    expect(second.status).toBe('duplicate')
    expect(second.refetchScheduled).toBe(false)
    expect(store.urls.size).toBe(1)
    const url = [...store.urls.values()][0]
    expect(url.discoveryLanes).toEqual(['LEGACY_ADAPTER', 'RSS'])
  })

  it('C. RSS image candidate is preserved as provenance', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store, 'AA', 'aa.com.tr')
    await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://www.aa.com.tr/tr/guncel/x',
      discoveryPrimaryImageCandidate: 'https://cdn.aa.com.tr/hero.jpg',
      guid: 'aa-guid-1',
    })
    const url = [...store.urls.values()][0]
    expect(url.discoveryPrimaryImageCandidate).toBe('https://cdn.aa.com.tr/hero.jpg')
    expect(url.guid).toBe('aa-guid-1')
  })

  it('D. RSS description is not used as body when page body exists', () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'NewsArticle',
        headline: 'Tam haber',
        articleBody: 'Sayfa gövdesi yeterince uzun. '.repeat(20),
      })}</script>
    </head><body><article><p>${'Sayfa gövdesi yeterince uzun. '.repeat(12)}</p></article></body></html>`
    const extracted = extractArticle(html, 'https://news.test/story')
    expect(extracted.articleBodyText).toContain('Sayfa gövdesi')
    expect(extracted.articleBodyText).not.toContain('RSS özeti')
  })

  it('E. extraction failure is not promoted as a full article', () => {
    const gate = evaluateExtractionQuality({
      title: 'Başlık',
      body: '',
      extractionConfidence: 0.1,
      wordCount: 0,
      boilerplateRatio: 0,
      linkDensity: 0,
      hasPrimaryImage: false,
      primaryImageConfidence: null,
      sourceHealth: 50,
      publishedAt: NOW,
      isDuplicateUrl: false,
      now: NOW,
    })
    expect(gate.status).toBe('EXTRACTION_FAILED')
    expect(gate.excludeFromCluster).toBe(true)
    expect(gate.excludeFromEditorialFunnel).toBe(true)
  })

  it('F. unrelated page images are rejected', () => {
    const html = `<html><body>
      <aside class="related-news"><img src="https://news.test/other-thumb.jpg" width="120" height="80" alt="Diğer haber" /></aside>
      <article><img src="https://news.test/hero.jpg" width="1200" height="800" alt="Yangın" /></article>
    </body></html>`
    const result = extractEditorialImages(html, 'https://news.test/story')
    expect(result.primary?.sourceUrl).toContain('hero.jpg')
    expect(result.accepted.every((c) => !c.sourceUrl.includes('other-thumb'))).toBe(true)
  })

  it('G. normal article respects extra image max', () => {
    const imgs = Array.from({ length: 12 }, (_, i) => `<img src="https://news.test/p${i}.jpg" width="800" height="500" />`).join('')
    const html = `<html><body><article>${imgs}</article></body></html>`
    const result = extractEditorialImages(html, 'https://news.test/story')
    expect(result.accepted.length).toBeLessThanOrEqual(1 + MAX_DEFAULT_EXTRAS)
  })

  it('H. true gallery cap is 16 extras', () => {
    const figs = Array.from(
      { length: 20 },
      (_, i) => `<figure><img src="https://news.test/g${i}.jpg" width="900" height="600" /></figure>`
    ).join('')
    const html = `<html><body><article>${figs}</article></body></html>`
    const result = extractEditorialImages(html, 'https://news.test/story')
    expect(result.accepted.length).toBeLessThanOrEqual(1 + MAX_GALLERY_EXTRAS)
  })

  it('I. same Manisa fire headlines become the same event', async () => {
    const scored = scoreClusterMatch(
      buildEventFingerprint({
        title: "Manisa’da makilik alanda yangın: Havadan ve karadan müdahale sürüyor",
        language: 'tr',
        countryCode: 'TR',
        city: 'manisa',
        publishedAt: NOW,
      }),
      {
        fingerprint: buildEventFingerprint({
          title: "Manisa'da makilik alanda yangın",
          language: 'tr',
          countryCode: 'TR',
          city: 'manisa',
          publishedAt: NOW,
        }),
        lastSeenAt: NOW,
        firstSeenAt: NOW,
      },
      NOW
    )
    expect(scored.band).toBe('HIGH')
    const store = new MemoryCrawlerStore()
    const cumhuriyet = await seedSource(store, 'Cumhuriyet', 'cumhuriyet.test', { city: 'Manisa' })
    const evrensel = await seedSource(store, 'Evrensel', 'evrensel.test', { city: 'Manisa' })
    await seedArticle(store, cumhuriyet, "Manisa’da makilik alanda yangın: Havadan ve karadan müdahale sürüyor", {
      city: 'Manisa',
    })
    await seedArticle(store, evrensel, "Manisa'da makilik alanda yangın", { city: 'Manisa' })
    const tick = await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    expect(tick.aiCalls).toBe(0)
    expect(store.clusters.size).toBe(1)
    expect([...store.clusters.values()][0].articleCount).toBe(2)
    expect([...store.clusters.values()][0].uniqueSourceCount).toBe(2)
  })

  it('J. different Manisa district fires stay separate events', () => {
    const scored = scoreClusterMatch(
      buildEventFingerprint({
        title: "Manisa Soma'da makilik alanda yangın",
        language: 'tr',
        countryCode: 'TR',
        city: 'manisa',
        district: 'soma',
        publishedAt: NOW,
      }),
      {
        fingerprint: buildEventFingerprint({
          title: "Manisa Akhisar'da makilik alanda yangın",
          language: 'tr',
          countryCode: 'TR',
          city: 'manisa',
          district: 'akhisar',
          publishedAt: NOW,
        }),
        lastSeenAt: NOW,
        firstSeenAt: NOW,
      },
      NOW
    )
    expect(scored.blockedReason).toBe('geography_mismatch')
    expect(scored.band).not.toBe('HIGH')
  })

  it('K. spelling variants still match where appropriate', () => {
    const scored = scoreClusterMatch(
      buildEventFingerprint({
        title: "Manisa'da makilik alanda yangin",
        language: 'tr',
        countryCode: 'TR',
        city: 'manisa',
        publishedAt: NOW,
      }),
      {
        fingerprint: buildEventFingerprint({
          title: "Manisa’da makilik alanda yangın",
          language: 'tr',
          countryCode: 'TR',
          city: 'manisa',
          publishedAt: NOW,
        }),
        lastSeenAt: NOW,
        firstSeenAt: NOW,
      },
      NOW
    )
    expect(scored.band).toBe('HIGH')
  })

  it('L. primary article is chosen by quality, not first arrival', async () => {
    const store = new MemoryCrawlerStore()
    const weak = await seedSource(store, 'Weak', 'weak.test', { healthScore: 20, qualityTier: 'TIER_C' })
    const strong = await seedSource(store, 'Strong', 'strong.test', { healthScore: 95, qualityTier: 'TIER_A' })
    const first = await seedArticle(store, weak, "Manisa'da makilik alanda yangın", {
      extractionConfidence: 0.4,
      wordCount: 80,
      fetchedAt: new Date(NOW.getTime() - 60_000),
    })
    const second = await seedArticle(store, strong, "Manisa’da makilik alanda yangın: Havadan ve karadan müdahale sürüyor", {
      extractionConfidence: 0.95,
      wordCount: 500,
      fetchedAt: NOW,
    })
    const picked = selectPrimaryArticle([
      { article: first, source: weak },
      { article: second, source: strong },
    ])
    expect(picked?.article.id).toBe(second.id)
    expect(picked?.reasons.join(' ')).toMatch(/confidence|body|trusted|image/i)
  })

  it('M. supporting sources are preserved', async () => {
    const store = new MemoryCrawlerStore()
    const a = await seedSource(store, 'Cumhuriyet', 'c.test', { city: 'Manisa' })
    const b = await seedSource(store, 'Evrensel', 'e.test', { city: 'Manisa' })
    await seedArticle(store, a, "Manisa'da makilik alanda yangın")
    await seedArticle(store, b, "Manisa’da makilik alanda yangın")
    await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    expect(store.articles.size).toBe(2)
    expect([...store.memberships.values()].length).toBe(2)
    const roles = [...store.memberships.values()].map((m) => m.membershipRole)
    expect(roles).toContain('PRIMARY')
    expect(roles).toContain('SUPPORTING')
  })

  it('N. exact duplicates are not independent confirmation', () => {
    const count = independentSourceCount([
      { article: { sourceId: 's1', isExactDuplicate: false, contentHash: 'same' } as RawArticleRecord, source: null },
      { article: { sourceId: 's2', isExactDuplicate: false, contentHash: 'same' } as RawArticleRecord, source: null },
      { article: { sourceId: 's3', isExactDuplicate: true, contentHash: 'other' } as RawArticleRecord, source: null },
    ])
    expect(count).toBe(1)
  })

  it('O. multi-source event is one future AI unit', async () => {
    const store = new MemoryCrawlerStore()
    const a = await seedSource(store, 'A', 'a.test')
    const b = await seedSource(store, 'B', 'b.test')
    const artA = await seedArticle(store, a, "Manisa'da makilik alanda yangın")
    const artB = await seedArticle(store, b, "Manisa’da makilik alanda yangın")
    const pack = buildEventAiPack(
      {
        id: 'cl_test',
        eventKey: 'manisa-fire',
        canonicalTitle: "Manisa'da makilik alanda yangın",
        normalizedTopic: 'manisa yangin',
        countryCode: 'TR',
        region: null,
        city: 'Manisa',
        district: null,
        aiEligibility: 'ELIGIBLE',
        importanceScore: 70,
        localImportance: 40,
        nationalImportance: 30,
        globalImportance: 10,
        uniqueSourceCount: 2,
        freshnessScore: 0.8,
        hasMaterialUpdate: false,
      },
      [memberEvidence(artA, a), memberEvidence(artB, b)]
    )
    expect(pack.futureAiJobs).toBe(1)
    expect(pack.providerRequests).toBe(0)
    expect(pack.packedText).toContain('PRIMARY')
    expect(futureAiUnitsForEvent(10).futureAiJobs).toBe(1)
  })

  it('P. no AI provider call', () => {
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    expect(isLegacyDirectAiEnabled()).toBe(false)
    expect(dispatchCrawlerArticleToNewsroom().aiRequests).toBe(0)
  })

  it('Q. published event + duplicate source does not create a new editorial event', async () => {
    const store = new MemoryCrawlerStore()
    const a = await seedSource(store, 'Cumhuriyet', 'c2.test', { city: 'Manisa' })
    const b = await seedSource(store, 'Evrensel', 'e2.test', { city: 'Manisa' })
    const first = await seedArticle(store, a, "Manisa'da makilik alanda yangın", {
      editorialStatus: 'PUBLISHED',
      editorialNewsId: 'news_published_1',
    })
    await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    const clusterId = [...store.clusters.keys()][0]
    await store.updateCluster(clusterId, { editorialDecision: 'APPROVED_FOR_AI' })
    await seedArticle(store, b, "Manisa’da makilik alanda yangın", { clusterStatus: 'PENDING' })
    await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    expect(store.clusters.size).toBe(1)
    const cluster = [...store.clusters.values()][0]
    expect(cluster.articleCount).toBe(2)
    expect(cluster.editorialDecision).toBe('APPROVED_FOR_AI')
    expect(cluster.futureAiUnit).toBe('PUBLISHED_LOCKED')
    expect(cluster.publishedNewsId).toBe('news_published_1')
    expect(first.editorialStatus).toBe('PUBLISHED')
  })

  it('R. material update attaches with a reason', () => {
    const update = detectMaterialUpdate({
      existingTitle: "Manisa'da makilik alanda yangın",
      existingLead: 'Müdahale sürüyor',
      incomingTitle: "Manisa'da yangın kontrol altına alındı, 2 ölü",
      incomingLead: 'Resmi açıklama geldi',
    })
    expect(update.hasMaterialUpdate).toBe(true)
    expect(update.materialUpdateReason).toMatch(/fire controlled|death toll|official statement/)
  })

  it('S. non-material duplicate does not reopen a published event', async () => {
    const store = new MemoryCrawlerStore()
    const a = await seedSource(store, 'Cumhuriyet', 'c3.test', { city: 'Manisa' })
    const b = await seedSource(store, 'DHA', 'd3.test', { city: 'Manisa' })
    await seedArticle(store, a, "Manisa'da makilik alanda yangın", {
      editorialStatus: 'PUBLISHED',
      editorialNewsId: 'news_2',
    })
    await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    const clusterId = [...store.clusters.keys()][0]
    await store.updateCluster(clusterId, { editorialDecision: 'APPROVED_FOR_AI', updateReviewStatus: 'NONE' })
    await seedArticle(store, b, "Manisa'da makilik alanda yangın", { description: 'Müdahale sürüyor' })
    await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    const cluster = [...store.clusters.values()][0]
    expect(cluster.updateReviewStatus).not.toBe('PENDING_UPDATE_REVIEW')
    expect(cluster.editorialDecision).toBe('APPROVED_FOR_AI')
  })

  it('T. PUBLISHED is absent from default Ham Haberler active queue', () => {
    expect(ACTIVE_EDITORIAL_STATUSES.includes('PUBLISHED')).toBe(false)
    expect(
      matchesRawArticleQuery(
        {
          editorialStatus: 'PUBLISHED',
          isExactDuplicate: false,
          qualityStatus: 'GOOD',
          imageUrls: [],
          mainImageUrl: null,
        } as unknown as RawArticleRecord,
        { queue: 'active' }
      )
    ).toBe(false)
  })

  it('U. provenance survives dedup', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store, 'AA', 'aa2.test')
    await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      discoveryLane: 'LEGACY_ADAPTER',
      sourceId: source.id,
      originalUrl: 'https://aa2.test/haber',
      guid: 'g-1',
      discoveryPrimaryImageCandidate: 'https://aa2.test/img.jpg',
    })
    await ingestDiscoveredArticle(store, {
      discoveryType: 'LISTING',
      discoveryLane: 'CRAWLER',
      sourceId: source.id,
      originalUrl: 'https://aa2.test/haber',
    })
    const url = [...store.urls.values()][0]
    expect(url.guid).toBe('g-1')
    expect(url.discoveryPrimaryImageCandidate).toBe('https://aa2.test/img.jpg')
    expect(url.discoveryLanes).toEqual(['LEGACY_ADAPTER', 'CRAWLER'])
  })

  it('V. pagination remains bounded', () => {
    expect(numberedPages(1, 12)).toContain(1)
    expect(numberedPages(5, 40).length).toBeGreaterThan(3)
  })

  it('W. source registry is not auto-activated', async () => {
    const store = new MemoryCrawlerStore()
    const paused = await store.insertSource({
      name: 'Paused Local',
      domain: 'paused.local',
      baseUrl: 'https://paused.local',
      countryCode: 'TR',
      language: 'tr',
      status: 'PAUSED',
      city: 'Akhisar',
    })
    expect(paused.status).toBe('PAUSED')
    const listed = await store.listSources()
    expect(listed.some((s) => s.id === paused.id && s.status === 'PAUSED')).toBe(true)
  })

  it('X. cron telemetry reflects unified flow without labeling idle as running', () => {
    const jobs = buildCrawlerCronSummaries({
      enabled: true,
      metrics: {},
      lastDiscoveryAt: null,
      lastExtractionAt: null,
    })
    expect(jobs.some((j) => j.flowLane === 'RSS DISCOVERY')).toBe(true)
    expect(jobs.some((j) => j.flowLane === 'CRAWLER DISCOVERY')).toBe(true)
    expect(jobs.some((j) => j.flowLane === 'FULL EXTRACTION')).toBe(true)
    expect(jobs.some((j) => j.flowLane === 'CLUSTERING')).toBe(true)
    expect(jobs.every((j) => j.status !== 'Çalışıyor')).toBe(true)
    expect(classifyCronPath('/api/cron/canakkale-nobetci-eczane')?.class).toBe(CRON_CLASS_B)
    expect(cronAuditByClass().feed_crawler_discovery.length).toBeGreaterThan(5)
  })

  it('Y. AI request count remains zero', () => {
    expect(dispatchCrawlerArticleToNewsroom().aiRequests).toBe(0)
    expect(futureAiUnitsForEvent(10).providerRequests).toBe(0)
    expect(PUBLISHED_BLOCKS_FOLLOWUP.bundled).toBe(false)
  })

  it('RSS enclosure is parsed as image candidate only', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item>
        <title>Foto</title>
        <link>https://news.test/foto</link>
        <enclosure url="https://cdn.test/rss-hero.jpg" type="image/jpeg" />
        <description>RSS özeti</description>
        <guid>guid-9</guid>
      </item>
    </channel></rss>`
    const items = parseRssFeed(xml)
    expect(items[0].imageUrl).toContain('rss-hero.jpg')
    expect(items[0].guid).toBe('guid-9')
    expect(items[0].description).toContain('RSS özeti')
  })

  it('RSS image agreement boosts matching page evidence and does not scrape extras', () => {
    const html = `<html><head>
      <meta property="og:image" content="https://cdn.test/hero.jpg" />
    </head><body>
      <header><img src="https://cdn.test/logo.png" class="logo" width="80" height="80" /></header>
      <article><img src="https://cdn.test/hero.jpg" width="1200" height="800" /></article>
    </body></html>`
    const agreed = extractEditorialImages(html, 'https://news.test/a', {
      discoveryPrimaryImageCandidate: 'https://cdn.test/hero.jpg?w=300',
    })
    expect(agreed.rssImageAgreement === 'agreed' || agreed.primary?.sourceUrl.includes('hero.jpg')).toBe(true)
    const none = extractEditorialImages(html, 'https://news.test/a')
    expect(none.accepted.length).toBe(agreed.accepted.length)
    const conflict = extractEditorialImages(html, 'https://news.test/a', {
      discoveryPrimaryImageCandidate: 'https://cdn.test/unrelated-rss.jpg',
    })
    expect(conflict.rssImageAgreement).toBe('conflict')
    expect(conflict.primary?.sourceUrl).not.toContain('unrelated-rss')
  })

  it('maps membership roles without deleting supporting evidence', () => {
    expect(assignMembershipRole({ isPrimary: true, isExactDuplicate: false, qualityStatus: 'GOOD', isMaterialUpdate: false })).toBe('PRIMARY')
    expect(assignMembershipRole({ isPrimary: false, isExactDuplicate: true, qualityStatus: 'GOOD', isMaterialUpdate: false })).toBe('DUPLICATE')
    expect(assignMembershipRole({ isPrimary: false, isExactDuplicate: false, qualityStatus: 'TOO_SHORT', isMaterialUpdate: false })).toBe('LOW_QUALITY')
    expect(assignMembershipRole({ isPrimary: false, isExactDuplicate: false, qualityStatus: 'GOOD', isMaterialUpdate: true })).toBe('MATERIAL_UPDATE')
  })
})
