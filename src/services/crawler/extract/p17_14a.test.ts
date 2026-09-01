import { describe, expect, it, vi } from 'vitest'
import { MemoryCrawlerStore } from '../store/memory'
import { runCrawlerTick } from '../workers/tick'
import { resetPolitenessForTests } from '../http/politeness'
import { resetRobotsCacheForTests } from '../http/robots'
import { extractArticle, applyPersistExtractionBody } from './pipeline'
import { EVRENSEL_EXTRACTED_GOOGLE_PROMO_FIXTURE } from './extractionFixtures'
import { evaluateExtractionQuality } from '../gate/quality'
import { htmlToPlainText } from './semantic'

const EVRENSEL_URL =
  'https://www.evrensel.net/haber/5998788/devrim-muhafizlari-ordusu-urdun-de-abd-ussu-vuruldu-cok-sayida-asker-olduruldu'

describe('P17.14A Evrensel EXTRACTED-path finalization', () => {
  it('domain-rule extraction removes nested CTA and sibling Google promo', () => {
    const r = extractArticle(EVRENSEL_EXTRACTED_GOOGLE_PROMO_FIXTURE, EVRENSEL_URL, 'tr')
    expect(r.extractionMethod).toBe('domain-rule')
    expect(r.articleBodyText).toContain('(Dış Haberler)')
    expect(r.articleBodyText).not.toContain("Evrensel'e Abone Ol")
    expect(r.articleBodyText).not.toContain('tercih edilen kaynak')
    expect(r.articleBodyText).not.toContain('31 yıldır')
    expect(htmlToPlainText(r.articleBodyHtml || '').replace(/\s+/g, ' ').trim()).toBe(
      r.articleBodyText.replace(/\s+/g, ' ').trim()
    )
  })

  it('applyPersistExtractionBody repairs pre-finalize dirty domain-rule payload', () => {
    const dirty = extractArticle(EVRENSEL_EXTRACTED_GOOGLE_PROMO_FIXTURE, EVRENSEL_URL, 'tr')
    const polluted = {
      ...dirty,
      articleBodyText: `${dirty.articleBodyText}\nEvrensel'i, Google'da tercih edilen kaynak olarak ekleyin`,
      articleBodyHtml: `${dirty.articleBodyHtml}<span>Evrensel'i, Google'da tercih edilen kaynak olarak ekleyin</span>`,
    }
    const repaired = applyPersistExtractionBody(polluted, EVRENSEL_URL)
    expect(repaired.articleBodyText).toContain('(Dış Haberler)')
    expect(repaired.articleBodyText).not.toContain('tercih edilen kaynak')
    expect(htmlToPlainText(repaired.articleBodyHtml || '').replace(/\s+/g, ' ').trim()).toBe(
      repaired.articleBodyText.replace(/\s+/g, ' ').trim()
    )
  })

  it('quality evaluator assigns GOOD (never EXTRACTED) for finalized Evrensel body', () => {
    const r = extractArticle(EVRENSEL_EXTRACTED_GOOGLE_PROMO_FIXTURE, EVRENSEL_URL, 'tr')
    const q = evaluateExtractionQuality({
      title: "Devrim Muhafızları Ordusu: Ürdün'de ABD üssü vuruldu",
      body: r.articleBodyText,
      extractionConfidence: r.extractionConfidence,
      wordCount: r.wordCount,
      boilerplateRatio: 0,
      linkDensity: 0,
      hasPrimaryImage: true,
      primaryImageConfidence: 0.8,
      sourceHealth: 50,
      publishedAt: new Date('2026-09-01'),
      isDuplicateUrl: false,
    })
    expect(q.status).not.toBe('EXTRACTED')
    expect(['GOOD', 'PARTIAL', 'LOW_CONFIDENCE']).toContain(q.status)
  })

  it('crawler tick persists finalized Evrensel body with GOOD quality status', async () => {
    process.env.NEWS_CRAWLER_MIN_INTERVAL_MS = '0'
    resetPolitenessForTests()
    resetRobotsCacheForTests()
    const store = new MemoryCrawlerStore()
    const source = await store.insertSource({
      name: 'Evrensel',
      domain: 'evrensel.net',
      baseUrl: 'https://www.evrensel.net',
      countryCode: 'TR',
      language: 'tr',
      status: 'ACTIVE',
      discoveryMethod: 'RSS',
      rssUrls: ['https://www.evrensel.net/rss.xml'],
      crawlIntervalSeconds: 120,
      robotsPolicy: 'FOLLOW',
    })
    await store.updateSource(source.id, { nextDiscoveryAt: new Date(0) })

    const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Ürdün</title><link>${EVRENSEL_URL}</link></item>
</channel></rss>`

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input).split('?')[0]
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /\n', { status: 200 })
      if (url.endsWith('/rss.xml')) return new Response(rss, { status: 200 })
      if (url.includes('/haber/5998788')) return new Response(EVRENSEL_EXTRACTED_GOOGLE_PROMO_FIXTURE, { status: 200 })
      return new Response('missing', { status: 404 })
    }) as typeof fetch

    await runCrawlerTick({
      store,
      fetchImpl,
      lookup: async () => ['93.184.216.34'],
      enabled: true,
      now: new Date('2026-09-02T12:00:00Z'),
    })

    const articles = [...store.articles.values()]
    expect(articles).toHaveLength(1)
    const article = articles[0]!
    expect(article.extractionMethod).toBe('domain-rule')
    expect(article.qualityStatus).not.toBe('EXTRACTED')
    expect(['GOOD', 'PARTIAL', 'LOW_CONFIDENCE']).toContain(article.qualityStatus)
    expect(article.articleBodyText).toBeTruthy()
    const bodyText = article.articleBodyText!
    expect(bodyText).toContain('(Dış Haberler)')
    expect(bodyText).not.toContain('tercih edilen kaynak')
    expect(bodyText).not.toContain("Evrensel'e Abone Ol")
    expect(htmlToPlainText(article.articleBodyHtml || '').replace(/\s+/g, ' ').trim()).toBe(
      bodyText.replace(/\s+/g, ' ').trim()
    )
  })
})
