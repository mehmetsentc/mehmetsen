import { describe, expect, it } from 'vitest'
import { categoryHintForEvent, isDominantAgenda } from './agenda'
import { buildEventFingerprint } from './fingerprint'
import { scoreClusterMatch } from './score'
import { runClusterTick } from './worker'
import { MemoryCrawlerStore } from '../store/memory'
import type { InsertRawArticleInput } from '../store/types'
import type { NewsSourceRecord } from '../types'

const NOW = new Date('2026-09-29T18:00:00Z')

const FATMA_TITLES = [
  'Fatma Betül Sayan Kaya ve eşinin mal varlıklarının dondurulması istendi - Olay Gazetesi Bursa',
  "AKP'den Fatma Betül Sayan Kaya'ya son darbe",
  'Fatma Betül Sayan Kaya ve eşinin mal varlıkları için yeni karar',
  "Fatma Betül Sayan Kaya ve eşi İlhan Kaya'nın mal varlıklarına dondurma kararı",
  'Fatma Betül Sayan Kaya ve eşinin tüm mal varlıklarının dondurulması istendi',
  'Fatma Betül Sayan Kaya ve eşinin mal varlıklarının dondurulması talebi',
  'Savcılık, Fatma Betül Sayan Kaya ve eşinin mal varlıklarının dondurulması için harekete geçti',
  'Son soruşturma: Fatma Betül Sayan Kaya ve eşinin mal varlıklarının dondurulması talebi',
]

function fp(title: string, city?: string) {
  return buildEventFingerprint({
    title,
    language: 'tr',
    countryCode: 'TR',
    city: city ?? null,
    publishedAt: NOW,
  })
}

async function seedSource(store: MemoryCrawlerStore, name: string, city: string) {
  const domain = `${name.toLowerCase().replace(/\s+/g, '')}.test`
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
    city,
  })
}

async function seedArticle(store: MemoryCrawlerStore, source: NewsSourceRecord, title: string) {
  const input: InsertRawArticleInput = {
    sourceId: source.id,
    discoveredUrlId: null,
    originalUrl: `https://${source.domain}/${encodeURIComponent(title).slice(0, 40)}`,
    normalizedUrl: `https://${source.domain}/${encodeURIComponent(title).slice(0, 40)}`,
    canonicalUrl: `https://${source.domain}/${encodeURIComponent(title).slice(0, 40)}`,
    urlHash: `${source.id}-${title}`,
    title,
    description: title,
    articleBodyText: `${title}. ${'gövde kelime '.repeat(30)}`,
    articleBodyHtml: `<p>${title}</p>`,
    author: null,
    publishedAt: NOW,
    modifiedAt: null,
    language: 'tr',
    countryCode: 'TR',
    region: null,
    city: source.city,
    district: null,
    mainImageUrl: null,
    imageUrls: [],
    videoUrls: [],
    wordCount: 180,
    charCount: 900,
    paragraphCount: 3,
    contentHash: `h-${source.id}`,
    titleHash: `t-${source.id}`,
    simhash: null,
    extractionMethod: 'semantic-html',
    extractionConfidence: 0.9,
    httpStatus: 200,
    fetchDurationMs: 40,
    fetchedAt: NOW,
    clusterStatus: 'PENDING',
    qualityStatus: 'GOOD',
  }
  return store.insertRawArticle(input)
}

describe('same story across publisher cities', () => {
  it('paraphrased Fatma headlines match even when outlet cities differ', () => {
    const anchor = fp(FATMA_TITLES[0], 'bursa')
    for (const title of FATMA_TITLES.slice(1)) {
      const scored = scoreClusterMatch(
        fp(title, title.includes('İzmir') ? 'izmir' : 'istanbul'),
        { fingerprint: anchor, lastSeenAt: NOW, firstSeenAt: NOW },
        NOW
      )
      expect(scored.band, title).toBe('HIGH')
      expect(scored.blockedReason, title).toBeNull()
    }
  })

  it('still separates different cities named in the headline', () => {
    const scored = scoreClusterMatch(
      fp("İstanbul'da deprem", 'istanbul'),
      { fingerprint: fp("İzmir'de deprem", 'izmir'), lastSeenAt: NOW, firstSeenAt: NOW },
      NOW
    )
    expect(scored.blockedReason).toBe('geography_mismatch')
    expect(scored.band).not.toBe('HIGH')
  })

  it('does not merge two different Erdoğan stories', () => {
    const scored = scoreClusterMatch(
      fp('Erdoğan kabine toplantısı sonrası konuştu'),
      { fingerprint: fp('Erdoğan ABD ziyaretini değerlendirdi'), lastSeenAt: NOW, firstSeenAt: NOW },
      NOW
    )
    expect(scored.band).not.toBe('HIGH')
  })

  it('groups the wire copies, notes source count, categorizes, and marks the real agenda', async () => {
    const store = new MemoryCrawlerStore()
    const cities = ['Bursa', 'İstanbul', 'İzmir', 'Ankara', 'Şırnak', 'İstanbul', 'İstanbul', 'İstanbul']
    for (let i = 0; i < FATMA_TITLES.length; i++) {
      const source = await seedSource(store, `Kaynak ${i} ${cities[i]}`, cities[i])
      await seedArticle(store, source, FATMA_TITLES[i])
    }
    const decoySource = await seedSource(store, 'Bursa Olay', 'Bursa')
    await seedArticle(store, decoySource, "Bursa'da iki otomobil çarpıştı, trafik kilitlendi")

    await runClusterTick({ store, now: NOW, startedAt: Date.now() })

    const fatma = [...store.articles.values()].filter((article) => (article.title || '').includes('Fatma'))
    const clusterIds = new Set(fatma.map((article) => article.clusterId))
    expect(clusterIds.size).toBe(1)
    const cluster = [...store.clusters.values()].find((row) => row.id === [...clusterIds][0])
    expect(cluster?.uniqueSourceCount).toBe(8)
    expect(cluster?.articleCount).toBe(8)
    expect(cluster?.categoryHint).toBe('gundem')
    expect(cluster?.importanceBreakdown?.realAgenda).toBe(1)
    expect(cluster?.importanceBreakdown?.confirmedSources).toBe(8)
    expect(cluster?.editorialPriority).toBe('HIGH')

    const decoy = [...store.articles.values()].find((article) => (article.title || '').includes('otomobil'))
    expect(decoy?.clusterId).not.toBe(cluster?.id)
  })
})

describe('dominant agenda', () => {
  it('requires a clear lead over the other stories', () => {
    expect(isDominantAgenda(8, [1, 2, 1])).toBe(true)
    expect(isDominantAgenda(3, [1])).toBe(false)
    expect(isDominantAgenda(4, [3, 1])).toBe(false)
    expect(isDominantAgenda(4, [1, 2])).toBe(true)
    expect(isDominantAgenda(6, [6])).toBe(true)
  })

  it('keeps a city fire yerel and a national copy as gündem', () => {
    expect(categoryHintForEvent("Manisa'da makilik alanda yangın", 2)).toBe('yerel-haber')
    expect(categoryHintForEvent('Fatma Betül Sayan Kaya ve eşinin mal varlıklarının dondurulması istendi', 8)).toBe(
      'gundem'
    )
  })
})
