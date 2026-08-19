import { describe, expect, it } from 'vitest'
import { localeLower, normalizeNewsText } from './cluster/normalize'
import { buildEventFingerprint, namedTokensFrom } from './cluster/fingerprint'
import { MATCH_WEIGHTS, scoreClusterMatch } from './cluster/score'
import { evaluateClusterEligibility } from './cluster/eligibility'
import { scoreEventImportance } from './cluster/importance'
import { detectMaterialUpdate, selectCanonicalArticle } from './cluster/canonical'
import { runClusterTick } from './cluster/worker'
import { MemoryCrawlerStore } from './store/memory'
import { dispatchCrawlerArticleToNewsroom } from './dispatch'
import { crawlerTickLimits } from './enabled'
import type { InsertRawArticleInput } from './store/types'
import type { NewsSourceRecord, RawArticleRecord } from './types'

const NOW = new Date('2026-08-19T12:00:00Z')

function fp(title: string, extra?: Partial<Parameters<typeof buildEventFingerprint>[0]>) {
  return buildEventFingerprint({
    title,
    language: 'tr',
    countryCode: 'TR',
    publishedAt: NOW,
    ...extra,
  })
}

function target(title: string, extra?: Partial<Parameters<typeof buildEventFingerprint>[0]>) {
  const fingerprint = fp(title, extra)
  return { fingerprint, lastSeenAt: NOW, firstSeenAt: NOW }
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
    originalUrl: `https://${source.domain}/${encodeURIComponent(title).slice(0, 20)}`,
    normalizedUrl: `https://${source.domain}/${encodeURIComponent(title).slice(0, 20)}`,
    canonicalUrl: `https://${source.domain}/${encodeURIComponent(title).slice(0, 20)}`,
    urlHash: title,
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
    mainImageUrl: null,
    imageUrls: [],
    videoUrls: [],
    wordCount: 200,
    charCount: 1200,
    paragraphCount: 4,
    contentHash: `h-${title}`,
    titleHash: `t-${title}`,
    simhash: null,
    extractionMethod: 'semantic-html',
    extractionConfidence: 0.9,
    httpStatus: 200,
    fetchDurationMs: 100,
    fetchedAt: NOW,
    clusterStatus: 'PENDING',
    ...opts,
  })
}

describe('crawler phase 3 clustering', () => {
  it('normalizes Turkish place names without ASCII damage', () => {
    expect(localeLower('İstanbul', 'tr')).toBe('istanbul')
    expect(normalizeNewsText('Çanakkale', 'tr')).toContain('çanakkale')
    expect(namedTokensFrom('Şırnak merkezli operasyon', 'tr').some((t) => t.includes('şırnak'))).toBe(true)
    expect(namedTokensFrom('Iğdır sınır hattı', 'tr').some((t) => t.includes('ığdır'))).toBe(true)
    expect(normalizeNewsText('The House voted', 'en')).toContain('the house voted')
  })

  it('merges same event with similar Turkish titles', () => {
    const scored = scoreClusterMatch(
      fp("Çanakkale'de orman yangını çıktı", { city: 'çanakkale' }),
      target("Çanakkale'de ormanlık alanda yangın", { city: 'çanakkale' }),
      NOW
    )
    expect(scored.band).toBe('HIGH')
    expect(scored.final).toBeGreaterThan(0.4)
  })

  it('merges same event with different wording', () => {
    const scored = scoreClusterMatch(
      fp("Çanakkale'de orman yangını çıktı", { city: 'çanakkale' }),
      target("Çanakkale'deki yangına ekipler müdahale ediyor", { city: 'çanakkale' }),
      NOW
    )
    expect(scored.band).toBe('HIGH')
  })

  it('does not merge unrelated events that share a weak keyword', () => {
    const scored = scoreClusterMatch(
      fp('Erdoğan kabine toplantısı sonrası konuştu'),
      target('Erdoğan ABD ziyaretini değerlendirdi'),
      NOW
    )
    expect(scored.band).not.toBe('HIGH')
  })

  it('keeps time-separated repeated events apart', () => {
    const later = new Date(NOW.getTime() + 3 * 24 * 3600 * 1000)
    const scored = scoreClusterMatch(
      buildEventFingerprint({ title: "İstanbul'da deprem", language: 'tr', city: 'istanbul', publishedAt: later }),
      {
        fingerprint: fp("İstanbul'da deprem", { city: 'istanbul' }),
        lastSeenAt: NOW,
        firstSeenAt: NOW,
      },
      later
    )
    expect(scored.band).toBe('LOW')
  })

  it('blocks numeric mismatch for magnitudes', () => {
    const scored = scoreClusterMatch(
      fp('Çanakkale açıklarında 5.8 büyüklüğünde deprem', { city: 'çanakkale' }),
      target('Çanakkale açıklarında 6.2 büyüklüğünde deprem', { city: 'çanakkale' }),
      NOW
    )
    expect(scored.blockedReason).toBe('numeric_mismatch')
    expect(scored.band).toBe('LOW')
  })

  it('blocks geography mismatch', () => {
    const scored = scoreClusterMatch(
      fp("İstanbul'da deprem", { city: 'istanbul' }),
      target("İzmir'de deprem", { city: 'izmir' }),
      NOW
    )
    expect(scored.blockedReason).toBe('geography_mismatch')
  })

  it('treats exact duplicate membership as idempotent and never calls AI', async () => {
    const store = new MemoryCrawlerStore()
    const source = await store.insertSource({
      name: 'NTV',
      domain: 'ntv.test',
      baseUrl: 'https://ntv.test',
      countryCode: 'TR',
      language: 'tr',
      status: 'ACTIVE',
      geographicScope: 'NATIONAL',
      crawlPriority: 'HIGH',
      healthScore: 80,
      qualityTier: 'TIER_A',
    })
    await seedArticle(store, source, "Çanakkale'de orman yangını çıktı", { city: 'Çanakkale' })
    const first = await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    const second = await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    expect(first.aiCalls).toBe(0)
    expect(second.articlesClustered).toBe(0)
    expect(store.memberships.size).toBe(1)
    expect(store.clusters.size).toBe(1)
    expect(dispatchCrawlerArticleToNewsroom().aiRequests).toBe(0)
  })

  it('builds a multi-source cluster and a separate single-source cluster', async () => {
    const store = new MemoryCrawlerStore()
    const ntv = await store.insertSource({
      name: 'NTV',
      domain: 'ntv.test',
      baseUrl: 'https://ntv.test',
      countryCode: 'TR',
      language: 'tr',
      status: 'ACTIVE',
      geographicScope: 'NATIONAL',
      crawlPriority: 'HIGH',
      healthScore: 80,
      qualityTier: 'TIER_A',
      city: 'Çanakkale',
    })
    const sozcu = await store.insertSource({
      name: 'Sozcu',
      domain: 'sozcu.test',
      baseUrl: 'https://sozcu.test',
      countryCode: 'TR',
      language: 'tr',
      status: 'ACTIVE',
      geographicScope: 'NATIONAL',
      crawlPriority: 'HIGH',
      healthScore: 82,
      qualityTier: 'TIER_A',
      city: 'Çanakkale',
    })
    const local = await store.insertSource({
      name: 'Biga Haber',
      domain: 'biga.test',
      baseUrl: 'https://biga.test',
      countryCode: 'TR',
      language: 'tr',
      status: 'ACTIVE',
      geographicScope: 'DISTRICT',
      sourceType: 'LOCAL',
      crawlPriority: 'NORMAL',
      healthScore: 75,
      qualityTier: 'TIER_A',
      city: 'Çanakkale',
      district: 'Biga',
    })
    await seedArticle(store, ntv, "Çanakkale'de orman yangını çıktı", { city: 'Çanakkale' })
    await seedArticle(store, sozcu, "Çanakkale'de ormanlık alanda yangın", { city: 'Çanakkale' })
    await seedArticle(store, local, 'Biga Belediyesi yeni park açtı', { city: 'Çanakkale', district: 'Biga' })
    const result = await runClusterTick({ store, now: NOW, startedAt: Date.now() })
    expect(result.aiCalls).toBe(0)
    expect(store.clusters.size).toBeGreaterThanOrEqual(2)
    const fire = [...store.clusters.values()].find((c) => (c.canonicalTitle || '').toLowerCase().includes('yangın') || (c.canonicalTitle || '').toLowerCase().includes('orman'))
    const park = [...store.clusters.values()].find((c) => (c.canonicalTitle || '').includes('park'))
    expect(fire?.uniqueSourceCount).toBeGreaterThanOrEqual(2)
    expect(park?.uniqueSourceCount).toBe(1)
    expect(park?.aiEligibility === 'ELIGIBLE' || park?.aiEligibility === 'HIGH_PRIORITY').toBe(true)
  })

  it('selects canonical title from stronger source without rewriting', () => {
    const picked = selectCanonicalArticle([
      {
        article: { title: 'Kısa', extractionConfidence: 0.4, wordCount: 90 } as RawArticleRecord,
        source: { healthScore: 40, qualityTier: 'TIER_C' } as NewsSourceRecord,
      },
      {
        article: { title: 'Çanakkale orman yangınına geniş müdahale sürüyor', extractionConfidence: 0.92, wordCount: 400 } as RawArticleRecord,
        source: { healthScore: 90, qualityTier: 'TIER_A' } as NewsSourceRecord,
      },
    ])
    expect(picked?.title).toContain('müdahale')
  })

  it('scores local importance higher than thin national copy', () => {
    const local = scoreEventImportance({
      uniqueSourceCount: 2,
      highQualitySourceCount: 1,
      articleCount: 2,
      exactDuplicateCount: 0,
      avgHealth: 80,
      avgConfidence: 0.85,
      crawlPriority: 'NORMAL',
      freshnessHours: 1,
      geographicScope: 'DISTRICT',
      hasCity: true,
      hasDistrict: true,
      localSourceCount: 2,
      nationalSourceCount: 0,
      countryCount: 1,
      publicationVelocityPerHour: 2,
    })
    expect(local.localImportance).toBeGreaterThan(local.globalImportance)
    expect(MATCH_WEIGHTS.titleSimilarity + MATCH_WEIGHTS.tokenOverlap).toBeGreaterThan(0.4)
  })

  it('marks WATCHING, ELIGIBLE, HIGH_PRIORITY and REJECTED deterministically', () => {
    expect(
      evaluateClusterEligibility({
        bestWordCount: 40,
        bestConfidence: 0.9,
        avgHealth: 80,
        uniqueSourceCount: 1,
        independentSourceCount: 1,
        exactDuplicateOnly: false,
        staleHours: 1,
        namedTokenCount: 3,
        looksLikeNews: true,
        geographicScope: 'NATIONAL',
        hasLocalGeography: false,
        importanceScore: 40,
        crawlPriority: 'NORMAL',
        watchingAgeMinutes: 10,
      }).eligibility
    ).toBe('REJECTED')
    expect(
      evaluateClusterEligibility({
        bestWordCount: 200,
        bestConfidence: 0.85,
        avgHealth: 80,
        uniqueSourceCount: 1,
        independentSourceCount: 1,
        exactDuplicateOnly: false,
        staleHours: 1,
        namedTokenCount: 3,
        looksLikeNews: true,
        geographicScope: 'NATIONAL',
        hasLocalGeography: false,
        importanceScore: 40,
        crawlPriority: 'NORMAL',
        watchingAgeMinutes: 10,
      }).eligibility
    ).toBe('WATCHING')
    expect(
      evaluateClusterEligibility({
        bestWordCount: 200,
        bestConfidence: 0.85,
        avgHealth: 80,
        uniqueSourceCount: 1,
        independentSourceCount: 1,
        exactDuplicateOnly: false,
        staleHours: 1,
        namedTokenCount: 3,
        looksLikeNews: true,
        geographicScope: 'CITY',
        hasLocalGeography: true,
        importanceScore: 55,
        crawlPriority: 'NORMAL',
        watchingAgeMinutes: 5,
      }).eligibility
    ).toBe('ELIGIBLE')
    expect(
      evaluateClusterEligibility({
        bestWordCount: 300,
        bestConfidence: 0.9,
        avgHealth: 85,
        uniqueSourceCount: 4,
        independentSourceCount: 3,
        exactDuplicateOnly: false,
        staleHours: 1,
        namedTokenCount: 5,
        looksLikeNews: true,
        geographicScope: 'NATIONAL',
        hasLocalGeography: false,
        importanceScore: 80,
        crawlPriority: 'BREAKING',
        watchingAgeMinutes: 20,
      }).eligibility
    ).toBe('HIGH_PRIORITY')
  })

  it('detects material updates without AI', () => {
    const update = detectMaterialUpdate({
      existingTitle: "Çanakkale'de yangın çıktı",
      existingLead: 'Ormanlık alanda duman',
      incomingTitle: "Çanakkale'de yangında tahliye başladı",
      incomingLead: 'Mahalleler tahliye ediliyor',
    })
    expect(update.hasMaterialUpdate).toBe(true)
  })

  it('exposes cluster candidate limits', () => {
    const limits = crawlerTickLimits()
    expect(limits.maxClusterArticlesPerTick).toBeGreaterThan(0)
    expect(limits.maxClusterCandidatesPerArticle).toBeGreaterThan(0)
    expect(limits.maxClusterRuntimeMs).toBeLessThan(limits.maxTickRuntimeMs)
  })
})
