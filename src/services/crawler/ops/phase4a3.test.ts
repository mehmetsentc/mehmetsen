import { describe, expect, it } from 'vitest'
import { cmsLabel } from '@/services/cms/uiLabels'
import { FEED_WEIGHT_META, sumFeedWeights } from '@/services/newsroomOs/feedWeightLabels'
import { PAGE_BLOCK_KIND_LABELS, PAGE_BLOCK_SOURCE_LABELS } from '@/services/newsroomOs/pageBlockLabels'
import { DEFAULT_FEED_ALGORITHM_WEIGHTS } from '@/types/newsroomOs'
import { MemoryCrawlerStore } from '../store/memory'
import {
  matchesRawArticleQuery,
  nextSortState,
  paginateRawArticles,
  queueCountsFromStatuses,
  sortRawArticleRows,
} from '../editorial/query'
import { EDITORIAL_STATUS_LABELS } from '../editorial/labels'
import { buildCrawlerCronSummaries, cronStatusTr } from '../ops/cronSummary'
import { describeRescrapePlan, previewBacklogCleanup } from '../ops/cleanupDryRun'
import { aggregateAnalyticsEvents } from '@/services/analytics/neonAnalytics'
import { estimateAnalyticsCost } from '@/services/analytics/costModel'
import type { InsertRawArticleInput } from '../store/types'
import type { NewsSourceRecord, RawArticleRecord } from '../types'
import { isCrawlerAiDispatchEnabled } from '../dispatch'
import { isLegacyDirectAiEnabled } from '../legacyFlags'

const NOW = new Date('2026-08-20T10:00:00Z')

async function seedSource(store: MemoryCrawlerStore) {
  return store.insertSource({
    name: 'AA',
    domain: 'aa.test',
    baseUrl: 'https://aa.test',
    countryCode: 'TR',
    language: 'tr',
    city: 'Çanakkale',
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
    originalUrl: `https://${source.domain}/${title}`,
    normalizedUrl: `https://${source.domain}/${title}`,
    canonicalUrl: `https://${source.domain}/${title}`,
    urlHash: title,
    title,
    description: title,
    articleBodyText: title,
    articleBodyHtml: `<p>${title}</p>`,
    author: null,
    publishedAt: NOW,
    modifiedAt: null,
    language: 'tr',
    countryCode: 'TR',
    region: null,
    city: 'Çanakkale',
    district: null,
    mainImageUrl: null,
    imageUrls: [],
    videoUrls: [],
    wordCount: 40,
    charCount: 200,
    paragraphCount: 1,
    contentHash: `h-${title}`,
    titleHash: `t-${title}`,
    simhash: null,
    extractionMethod: 'semantic-html',
    extractionConfidence: 0.9,
    httpStatus: 200,
    fetchDurationMs: 10,
    fetchedAt: NOW,
    ...opts,
  })
}

describe('phase 4A.3 raw queue', () => {
  it('hides PUBLISHED from the default active queue', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    await seedArticle(store, src, 'yeni', { editorialStatus: 'NEW' })
    await seedArticle(store, src, 'yayin', { editorialStatus: 'PUBLISHED', editorialNewsId: 'news_1' })
    await seedArticle(store, src, 'red', { editorialStatus: 'REJECTED' })
    await seedArticle(store, src, 'arsiv', { editorialStatus: 'ARCHIVED' })
    const page = await store.listRawArticlesPage({ page: 1, pageSize: 25, queue: 'active' })
    expect(page.articles.map((a) => a.title)).toEqual(['yeni'])
    expect(page.queueCounts?.published).toBe(1)
    expect(page.queueCounts?.rejected).toBe(1)
    expect(page.queueCounts?.archived).toBe(1)
    expect(page.queueCounts?.active).toBe(1)
  })

  it('status filter shows published / rejected / archived tabs', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    await seedArticle(store, src, 'yayin', { editorialStatus: 'PUBLISHED' })
    const published = await store.listRawArticlesPage({ queue: 'published' })
    expect(published.articles).toHaveLength(1)
    const rejected = await store.listRawArticlesPage({ queue: 'rejected' })
    expect(rejected.articles).toHaveLength(0)
  })

  it('sorts server-side ASC/DESC and paginates with sort', () => {
    const rows = [1083, 76, 882, 121, 482].map((wordCount, i) => ({
      id: `raw_${i}`,
      sourceId: 's1',
      sourceName: i % 2 ? 'DHA' : 'AA',
      title: `Haber ${wordCount}`,
      fetchedAt: new Date(2026, 7, 19, 12, i),
      publishedAt: null,
      countryCode: 'TR',
      city: null,
      isExactDuplicate: false,
      qualityStatus: 'EXTRACTED',
      editorialStatus: 'NEW',
      wordCount,
      extractionConfidence: wordCount / 2000,
      mainImageUrl: null,
      imageUrls: [],
    })) as unknown as Array<RawArticleRecord & { sourceName: string }>

    const desc = sortRawArticleRows(rows, { sortBy: 'wordCount', order: 'desc' })
    expect(desc.map((r) => r.wordCount)).toEqual([1083, 882, 482, 121, 76])
    const asc = sortRawArticleRows(rows, { sortBy: 'wordCount', order: 'asc' })
    expect(asc.map((r) => r.wordCount)).toEqual([76, 121, 482, 882, 1083])

    const page1 = paginateRawArticles(desc, { page: 1, pageSize: 25, sortBy: 'wordCount', order: 'desc' })
    expect(page1.articles[0].wordCount).toBe(1083)
    expect(nextSortState(null, null, 'wordCount')).toEqual({ sort: 'wordCount', order: 'desc' })
    expect(nextSortState('wordCount', 'desc', 'wordCount')).toEqual({ sort: 'wordCount', order: 'asc' })
    expect(nextSortState('wordCount', 'asc', 'wordCount')).toEqual({ sort: null, order: null })
    expect(matchesRawArticleQuery(rows[0], { editorialStatus: 'NEW' })).toBe(true)
  })
})

describe('phase 4A.3 turkish mapping', () => {
  it('maps CMS enums without renaming DB values', () => {
    expect(cmsLabel('draft')).toBe('Taslak')
    expect(cmsLabel('active')).toBe('Aktif')
    expect(cmsLabel('APPROVED')).toBe('Onaylandı')
    expect(cmsLabel('WATCHING')).toBe('İzleniyor')
    expect(cmsLabel('ELIGIBLE')).toBe('Uygun')
    expect(cmsLabel('REJECTED')).toBe('Reddedildi')
    expect(cmsLabel('OPEN')).toBe('Açık')
    expect(cmsLabel('HIGH')).toBe('Yüksek')
    expect(cmsLabel('BREAKING')).toBe('Son Dakika')
    expect(cmsLabel('NORMAL')).toBe('Normal')
    expect(cmsLabel('algorithmic')).toBe('Algoritmik')
    expect(EDITORIAL_STATUS_LABELS.PUBLISHED).toBe('Yayınlandı')
    expect(PAGE_BLOCK_KIND_LABELS.category_rail).toBe('Kategori bandı')
    expect(PAGE_BLOCK_SOURCE_LABELS.algorithmic).toBe('Algoritmik')
    expect(FEED_WEIGHT_META.recency.label).toBe('Güncellik')
    expect(FEED_WEIGHT_META.duplicatePenalty.description).toContain('benzer')
    expect(sumFeedWeights(DEFAULT_FEED_ALGORITHM_WEIGHTS).score).toBeGreaterThan(0.8)
  })
})

describe('phase 4A.3 cron summary', () => {
  it('builds crawler job summaries with Turkish statuses', () => {
    const jobs = buildCrawlerCronSummaries({
      enabled: true,
      metrics: { sources_checked: 4, articles_fetched: 10, extraction_success: 9, extraction_fail: 1 },
      lastDiscoveryAt: NOW,
      lastExtractionAt: NOW,
    })
    expect(jobs.length).toBeGreaterThan(0)
    expect(jobs.some((j) => j.lane === 'CRAWLER')).toBe(true)
    expect(jobs.some((j) => j.lane === 'RSS RADAR')).toBe(true)
    expect(jobs.some((j) => j.lane === 'AI DISPATCH')).toBe(true)
    expect(cronStatusTr('success')).toBe('Başarılı')
    expect(cronStatusTr('failed')).toBe('Başarısız')
    expect(cronStatusTr('running')).toBe('Çalışıyor')
    expect(cronStatusTr('pending', false)).toBe('Devre Dışı')
    expect(jobs[0].processed).toBeGreaterThan(0)
  })
})

describe('phase 4A.3 analytics aggregation', () => {
  it('aggregates buffer events into hourly/daily without scanning for CMS', () => {
    const events = [
      {
        eventId: 'e1',
        event: 'pageview' as const,
        occurredAt: NOW,
        path: '/haber/a',
        postId: 'n1',
        visitorHash: 'v1',
        sessionHash: 's1',
        referrer: 'google.com',
        device: 'mobile' as const,
        city: 'Çanakkale',
        country: 'TR',
        durationMs: 0,
        scrollDepth: 0,
      },
      {
        eventId: 'e2',
        event: 'engagement' as const,
        occurredAt: NOW,
        path: '/haber/a',
        postId: 'n1',
        visitorHash: 'v1',
        sessionHash: 's1',
        referrer: 'google.com',
        device: 'mobile' as const,
        city: 'Çanakkale',
        country: 'TR',
        durationMs: 12000,
        scrollDepth: 80,
      },
    ]
    const agg = aggregateAnalyticsEvents(events)
    expect(agg.daily[0].pageviews).toBe(1)
    expect(agg.daily[0].uniqueVisitors).toBe(1)
    expect(agg.daily[0].avgDurationMs).toBe(12000)
    expect(agg.hourly[0].pageviews).toBe(1)
    const cost = estimateAnalyticsCost(10_000)
    expect(cost.writesPerDay).toBeGreaterThan(10_000)
    expect(cost.cmsReadsPerDay).toBeLessThan(cost.writesPerDay)
  })
})

describe('phase 4A.3 cleanup dry-run', () => {
  it('never includes PUBLISHED and does not execute deletion', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const live = await seedArticle(store, src, 'aktif')
    const pub = await seedArticle(store, src, 'yayinda', { editorialStatus: 'PUBLISHED', editorialNewsId: 'cms_1' })
    await store.upsertArticleMedia({
      articleId: live.id,
      mediaType: 'image',
      sourceUrl: 'https://x.test/a.jpg',
      normalizedUrl: 'https://x.test/a.jpg',
      width: 800,
      height: 600,
      altText: null,
      caption: null,
      credit: null,
      mimeType: 'image/jpeg',
      discoveryMethod: 'og',
      score: 80,
      isPrimary: true,
      status: 'ACCEPTED',
      rejectionReason: null,
      qualityScore: 80,
      contentHash: 'h',
      perceptualHash: null,
    })
    const report = await previewBacklogCleanup(store)
    expect(report.dryRun).toBe(true)
    expect(report.executed).toBe(false)
    expect(report.publishedPreserved).toBe(1)
    expect(report.cmsNewsPreserved).toBe(1)
    expect(report.rawToDelete).toBe(1)
    expect(report.notes.some((n) => n.includes('never'))).toBe(true)
    expect(await store.getRawArticle(pub.id)).toBeTruthy()
    expect(describeRescrapePlan().executed).toBe(false)
    expect(describeRescrapePlan().aiRequests).toBe(0)
  })
})

describe('phase 4A.3 AI gates remain closed', () => {
  it('keeps dispatch and legacy direct AI off', () => {
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    expect(isLegacyDirectAiEnabled()).toBe(false)
  })
})

describe('queueCounts helper', () => {
  it('sums active statuses from DB COUNT-shaped maps', () => {
    expect(
      queueCountsFromStatuses({ NEW: 3, IN_REVIEW: 1, PUBLISHED: 9, REJECTED: 2, ARCHIVED: 4 })
    ).toEqual({ active: 4, published: 9, review: 0, rejected: 2, archived: 4 })
  })
})
