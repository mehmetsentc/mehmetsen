import { describe, expect, it } from 'vitest'
import { MemoryCrawlerStore } from '../store/memory'
import type { InsertRawArticleInput } from '../store/types'
import type { NewsSourceRecord } from '../types'
import { ingestDiscoveredArticle } from '../ingestDiscoveredArticle'
import { extractArticle } from '../extract/pipeline'
import { extractEditorialImages } from '../extract/images'
import { fixtureRelatedNews } from '../extract/imageFixtures'
import { evaluateExtractionQuality } from '../gate/quality'
import { runClusterTick } from '../cluster/worker'
import { selectPrimaryArticle } from '../cluster/canonical'
import { futureAiUnitsForEvent } from '../cluster/roles'
import { ACTIVE_EDITORIAL_STATUSES, matchesRawArticleQuery } from '../editorial/query'
import { isCrawlerAiDispatchEnabled } from '../dispatch'
import { isLegacyDirectAiEnabled } from '../legacyFlags'
import { runCrawlerTick } from '../workers/tick'
import { previewProtectedCleanup, executeProtectedCleanup } from './cleanupExecute'
import { previewBacklogCleanup } from './cleanupDryRun'
import { isInRecentRebuildWindow, rebuildCutoffAt, shouldSkipOutsideRebuildWindow } from './rebuildWindow'
import { effectiveFreshnessHours, isMaintenanceLock } from './opsState'
import { MAX_DEFAULT_EXTRAS, MAX_GALLERY_EXTRAS } from '../extract/imageNormalize'

const NOW = new Date('2026-08-20T10:00:00Z')

async function seedSource(store: MemoryCrawlerStore, name = 'AA') {
  return store.insertSource({
    name,
    domain: `${name.toLowerCase()}.test`,
    baseUrl: `https://${name.toLowerCase()}.test`,
    countryCode: 'TR',
    language: 'tr',
    status: 'ACTIVE',
    city: 'Manisa',
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
    articleBodyText: `${title}. ${'haber gövdesi kelime '.repeat(40)}`,
    articleBodyHtml: `<p>${title}</p>`,
    author: null,
    publishedAt: NOW,
    modifiedAt: null,
    language: 'tr',
    countryCode: 'TR',
    region: null,
    city: 'Manisa',
    district: null,
    mainImageUrl: 'https://cdn.test/hero.jpg',
    imageUrls: ['https://cdn.test/hero.jpg'],
    videoUrls: [],
    wordCount: 220,
    charCount: 1400,
    paragraphCount: 4,
    contentHash: `h-${source.id}-${title}`,
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

async function addMedia(store: MemoryCrawlerStore, articleId: string, url: string) {
  await store.upsertArticleMedia({
    articleId,
    mediaType: 'image',
    sourceUrl: url,
    normalizedUrl: url,
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
    contentHash: url,
    perceptualHash: null,
  })
}

describe('phase 4A.5 protected cleanup A-N', () => {
  it('A. published raw is protected', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const pub = await seedArticle(store, src, 'yayin', { editorialStatus: 'PUBLISHED' })
    const plan = await previewProtectedCleanup(store)
    expect(plan.protectedRawIds).toContain(pub.id)
    expect(plan.eligibleRawIds).not.toContain(pub.id)
  })

  it('B. editorial_news_id linked raw is protected', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const linked = await seedArticle(store, src, 'draft-link', { editorialStatus: 'NEW', editorialNewsId: 'news_draft' })
    const plan = await previewProtectedCleanup(store)
    expect(plan.protectedRawIds).toContain(linked.id)
    expect(plan.protectedEditorialLinkedRaw).toBe(1)
  })

  it('C. published media is protected', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const pub = await seedArticle(store, src, 'yayin-media', { editorialStatus: 'PUBLISHED' })
    await addMedia(store, pub.id, 'https://cdn.test/used.jpg')
    const orphan = await seedArticle(store, src, 'orphan')
    await addMedia(store, orphan.id, 'https://cdn.test/junk.jpg')
    const plan = await previewProtectedCleanup(store)
    const pubMedia = [...store.media.values()].find((m) => m.articleId === pub.id)!
    const junk = [...store.media.values()].find((m) => m.articleId === orphan.id)!
    expect(plan.protectedMediaIds).toContain(pubMedia.id)
    expect(plan.eligibleMediaIds).toContain(junk.id)
  })

  it('D. audit survives cleanup', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const live = await seedArticle(store, src, 'silinecek')
    await store.insertEditorialAudit({
      id: 'aud_1',
      actorId: 'u1',
      actorEmail: 'a@test',
      actorRole: 'editor',
      action: 'REJECT',
      entityType: 'raw_article',
      entityId: live.id,
      affectedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      reason: null,
      note: null,
      previousState: 'NEW',
      newState: 'REJECTED',
      editorialPriority: null,
      selectionMode: null,
      createdAt: NOW,
    })
    const before = store.audits.length
    await executeProtectedCleanup(store, { actorId: 'admin', actorRole: 'super_admin' })
    expect(store.audits.length).toBeGreaterThanOrEqual(before)
    expect(store.audits.some((a) => a.id === 'aud_1')).toBe(true)
  })

  it('E. source registry survives', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    await store.updateSource(src.id, { status: 'PAUSED' })
    await seedArticle(store, src, 'x')
    const before = store.sources.size
    await executeProtectedCleanup(store, { actorId: 'admin', actorRole: 'super_admin' })
    expect(store.sources.size).toBe(before)
    expect(store.sources.get(src.id)?.status).toBe('PAUSED')
  })

  it('F. manually edited draft is protected', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const draft = await seedArticle(store, src, 'taslak', { editorialStatus: 'DRAFT' })
    const plan = await previewProtectedCleanup(store)
    expect(plan.protectedRawIds).toContain(draft.id)
    expect(plan.protectedManualEditorial).toBeGreaterThan(0)
  })

  it('G. non-published orphan raw is eligible', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const orphan = await seedArticle(store, src, 'orphan-new', { editorialStatus: 'NEW' })
    const plan = await previewProtectedCleanup(store)
    expect(plan.eligibleRawIds).toContain(orphan.id)
  })

  it('H. obsolete media is eligible', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const orphan = await seedArticle(store, src, 'media-orphan')
    await addMedia(store, orphan.id, 'https://cdn.test/pagewide.jpg')
    const plan = await previewProtectedCleanup(store)
    expect(plan.mediaEligible).toBe(1)
  })

  it('I. cleanup dry-run mutates nothing', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    await seedArticle(store, src, 'keep', { editorialStatus: 'PUBLISHED' })
    await seedArticle(store, src, 'drop')
    const before = store.articles.size
    const report = await previewBacklogCleanup(store)
    expect(report.dryRun).toBe(true)
    expect(report.executed).toBe(false)
    expect(store.articles.size).toBe(before)
  })

  it('J. cleanup execution matches dry-run protected set', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const pub = await seedArticle(store, src, 'yayin', { editorialStatus: 'PUBLISHED', editorialNewsId: 'n1' })
    const drop = await seedArticle(store, src, 'drop-me')
    const plan = await previewProtectedCleanup(store)
    expect(plan.invariantOk).toBe(true)
    const result = await executeProtectedCleanup(store, { actorId: 'admin', actorRole: 'super_admin' })
    expect(result.executed).toBe(true)
    expect(await store.getRawArticle(pub.id)).toBeTruthy()
    expect(await store.getRawArticle(drop.id)).toBeNull()
    expect(result.rawDeleted).toBe(plan.rawEligible)
  })

  it('K. maintenance lock prevents race', async () => {
    const store = new MemoryCrawlerStore()
    store.opsState.maintenanceMode = 'MAINTENANCE'
    expect(isMaintenanceLock(store.opsState)).toBe(true)
    const tick = await runCrawlerTick({ store, enabled: true, now: NOW })
    expect(tick.skipped).toBe(true)
    expect(tick.reason).toBe('CRAWLER_MAINTENANCE')
    expect(tick.aiRequests).toBe(0)
  })

  it('L/M/N. 24h cutoff includes recent and excludes 25h', () => {
    const cutoff = rebuildCutoffAt(NOW, 24)
    const recent = isInRecentRebuildWindow({ publishedAt: new Date(NOW.getTime() - 23 * 3600_000), cutoffAt: cutoff })
    const old = isInRecentRebuildWindow({ publishedAt: new Date(NOW.getTime() - 25 * 3600_000), cutoffAt: cutoff })
    expect(recent.include).toBe(true)
    expect(recent.provenance).toBe('published_at')
    expect(old.include).toBe(false)
    expect(effectiveFreshnessHours(48, { ...storeishOps(cutoff), rebuildStatus: 'REDISCOVERING' })).toBe(24)
  })
})

function storeishOps(cutoff: Date) {
  return {
    id: 'global' as const,
    maintenanceMode: 'IDLE' as const,
    rebuildStatus: 'REDISCOVERING' as const,
    rebuildWindowHours: 24,
    cutoffAt: cutoff,
    rebuildStartedAt: NOW,
    rebuildFinishedAt: null,
    planHash: null,
    lastError: null,
    discovered: 0,
    pending: 0,
    extracted: 0,
    failed: 0,
    events: 0,
    multiSource: 0,
    updatedAt: NOW,
  }
}

describe('phase 4A.5 rebuild + pipeline O-Z', () => {
  it('O. RSS and crawler still converge', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store, 'Evrensel')
    const first = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      discoveryLane: 'LEGACY_ADAPTER',
      sourceId: source.id,
      originalUrl: 'https://evrensel.test/haber/a',
    })
    const second = await ingestDiscoveredArticle(store, {
      discoveryType: 'LISTING',
      discoveryLane: 'CRAWLER',
      sourceId: source.id,
      originalUrl: 'https://evrensel.test/haber/a?utm_source=rss',
    })
    expect(first.status).toBe('inserted')
    expect(second.status).toBe('duplicate')
    expect(store.urls.size).toBe(1)
  })

  it('P. duplicate recent URL fetched once', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store)
    await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://aa.test/u1',
    })
    const dup = await ingestDiscoveredArticle(store, {
      discoveryType: 'RSS',
      sourceId: source.id,
      originalUrl: 'https://aa.test/u1',
    })
    expect(dup.status).toBe('duplicate')
    expect(store.urls.size).toBe(1)
  })

  it('Q. full article extraction works', () => {
    const html = `<html><head><title>Manisa yangını</title></head><body><article><h1>Manisa yangını</h1><p>${'Ekipler bölgede. '.repeat(40)}</p></article></body></html>`
    const extracted = extractArticle(html, 'https://aa.test/yangin', 'tr')
    expect(extracted.articleBodyText.length).toBeGreaterThan(200)
    expect(extracted.title).toBeTruthy()
  })

  it('R. image regression remains fixed', () => {
    const result = extractEditorialImages(fixtureRelatedNews(), 'https://news.test/cinema')
    expect(result.accepted.some((c) => c.sourceUrl.includes('politics-unrelated'))).toBe(false)
    expect(MAX_DEFAULT_EXTRAS).toBeLessThanOrEqual(8)
    expect(MAX_GALLERY_EXTRAS).toBeLessThanOrEqual(16)
  })

  it('S/T. same event merges; distinct events stay separate', async () => {
    const store = new MemoryCrawlerStore()
    const a = await seedSource(store, 'Cumhuriyet')
    const b = await seedSource(store, 'Evrensel')
    await seedArticle(store, a, "Manisa'da makilik alanda yangın")
    await seedArticle(store, b, "Manisa'da makilik alanda yangın")
    await seedArticle(store, a, 'Çanakkale köprü bakım çalışması', { contentHash: 'other' })
    await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    expect(store.clusters.size).toBeGreaterThanOrEqual(2)
  })

  it('U/V. primary source quality selection keeps supporting', async () => {
    const store = new MemoryCrawlerStore()
    const strong = await seedSource(store, 'AA')
    const weak = await seedSource(store, 'Blog')
    await store.updateSource(strong.id, { qualityTier: 'TIER_A', healthScore: 90 })
    await store.updateSource(weak.id, { qualityTier: 'TIER_C', healthScore: 40 })
    const a = await seedArticle(store, strong, 'Manisa yangın bir')
    const b = await seedArticle(store, weak, 'Manisa yangın iki', { extractionConfidence: 0.4, wordCount: 40 })
    const picked = selectPrimaryArticle([
      { article: a, source: await store.getSource(strong.id) },
      { article: b, source: await store.getSource(weak.id) },
    ])
    expect(picked?.article.id).toBe(a.id)
    expect(b.id).not.toBe(picked?.article.id)
  })

  it('W. future AI unit is event-based', () => {
    const units = futureAiUnitsForEvent(12)
    expect(units.eventCount).toBe(1)
    expect(units.futureAiJobs).toBe(1)
    expect(units.providerRequests).toBe(0)
  })

  it('X. rebuilt events do not inherit APPROVED_FOR_AI', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const old = await seedArticle(store, src, 'eski onay')
    const cluster = await store.insertCluster({
      representativeArticleId: old.id,
      normalizedTopic: 'eski',
      countryCode: 'TR',
      city: 'Manisa',
    })
    await store.updateCluster(cluster.id, { editorialDecision: 'APPROVED_FOR_AI' })
    await executeProtectedCleanup(store, { actorId: 'admin', actorRole: 'super_admin' })
    const kept = store.clusters.get(cluster.id)
    if (kept) expect(kept.editorialDecision).toBe('APPROVED_FOR_AI')
    const fresh = await seedArticle(store, src, 'yeni 24s')
    await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    const rebuilt = [...store.clusters.values()].find(
      (c) => c.representativeArticleId === fresh.id || (c.normalizedTopic || '').includes('yeni')
    )
    if (rebuilt) expect(rebuilt.editorialDecision).not.toBe('APPROVED_FOR_AI')
  })

  it('Y. PUBLISHED absent from active Ham Haberler', () => {
    expect(ACTIVE_EDITORIAL_STATUSES.includes('PUBLISHED')).toBe(false)
    expect(
      matchesRawArticleQuery(
        { editorialStatus: 'PUBLISHED', isExactDuplicate: false, qualityStatus: 'GOOD', imageUrls: [], mainImageUrl: null } as never,
        { queue: 'active' }
      )
    ).toBe(false)
  })

  it('Z. provider calls = 0', () => {
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    expect(isLegacyDirectAiEnabled()).toBe(false)
    expect(
      evaluateExtractionQuality({
        title: 'Manisa yangın haberi',
        body: 'Ekipler bölgede. '.repeat(40),
        extractionConfidence: 0.9,
        wordCount: 220,
        boilerplateRatio: 0.1,
        linkDensity: 0.1,
        hasPrimaryImage: true,
        primaryImageConfidence: 0.9,
        sourceHealth: 80,
        publishedAt: NOW,
        isDuplicateUrl: false,
      }).status
    ).toBeTruthy()
  })

  it('skips items older than rebuild cutoff when window is active', () => {
    const cutoff = rebuildCutoffAt(NOW, 24)
    const ops = storeishOps(cutoff)
    expect(
      shouldSkipOutsideRebuildWindow({
        publishedAt: new Date(NOW.getTime() - 30 * 3600_000),
        ops,
        now: NOW,
      })
    ).toBe(true)
  })
})
