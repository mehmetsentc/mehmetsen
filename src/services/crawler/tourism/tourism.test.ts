import { describe, expect, it } from 'vitest'
import { extractArticle } from '../extract/pipeline'
import { draftPrefillFromRaw } from '../editorial/prefill'
import { tourismCategoryHint } from '../cluster/worker'
import type { NewsSourceRecord, RawArticleRecord } from '../types'
import { isTourismSource, TOURISM_SOURCES, tourismSourceInputs } from './registry'

const PARA = (n: number) =>
  Array.from({ length: n }, (_, i) => `<p>Turizm sektöründe ${i + 1}. paragraf: otel doluluk oranları ve sezon beklentileri değerlendirildi.</p>`).join('')

describe('TOURISM-SRC-1 kaynak kaydı', () => {
  it('13 kaynak, benzersiz anahtar, RSS, TOURISM kategorisi; TR NORMAL, global LOW', () => {
    const inputs = tourismSourceInputs('ACTIVE')
    expect(inputs).toHaveLength(TOURISM_SOURCES.length)
    expect(new Set(inputs.map((i) => i.registryKey)).size).toBe(inputs.length)
    expect(inputs.every((i) => i.discoveryMethod === 'RSS' && i.rssUrls?.length === 1 && i.sourceCategory === 'TOURISM')).toBe(true)
    expect(inputs.every((i) => i.registryKey?.startsWith('turizm-') && i.status === 'ACTIVE')).toBe(true)
    const tr = inputs.filter((i) => i.countryCode === 'TR')
    const global = inputs.filter((i) => i.countryCode !== 'TR')
    expect(tr.length).toBeGreaterThan(0)
    expect(tr.every((i) => i.crawlPriority === 'NORMAL' && i.language === 'tr')).toBe(true)
    expect(global.every((i) => i.crawlPriority === 'LOW' && i.language === 'en' && i.geographicScope === 'GLOBAL')).toBe(true)
    expect(tourismSourceInputs()[0].status).toBe('PAUSED')
  })

  it('canlı testte alınamayan kaynaklar listede yok', () => {
    const domains = TOURISM_SOURCES.map((s) => s.domain)
    for (const d of ['turizmgazetesi.com', 'hospitalitynet.org', 'ntv.com.tr', 'phocuswire.com']) {
      expect(domains).not.toContain(d)
    }
  })
})

describe('TOURISM-SRC-1 gövde kuralları (selectBeforeStrip)', () => {
  it('ASP.NET <form> içindeki gövde (turizmajansi.com)', () => {
    const html = `<html><body><form id="aspnetForm"><article class="news-detail"><h1>İzmir turizminde büyük hedef</h1>
      <div class="content-text">${PARA(5)}<div class="share-box">Paylaş</div></div></article></form></body></html>`
    const e = extractArticle(html, 'https://www.turizmajansi.com/haber/izmir-h74736', 'tr')
    expect(e.extractionMethod).toBe('domain-rule')
    expect(e.wordCount).toBeGreaterThan(40)
    expect(e.articleBodyText).not.toContain('Paylaş')
  })

  it('"sidebar" sınıflı kapsayıcı içindeki gövde (traveldailynews)', () => {
    const html = `<html><body><div class="mkdf-two-columns-75-25 mkdf-content-has-sidebar"><article><h1>US ground stop lifted</h1>
      <div class="mkdf-post-text-inner">${PARA(5)}<div class="contact">Contact us</div></div></article></div></body></html>`
    const e = extractArticle(html, 'https://www.traveldailynews.com/organizations/x', 'en')
    expect(e.extractionMethod).toBe('domain-rule')
    expect(e.articleBodyText).not.toContain('Contact us')
  })

  it('kök sınıfı genel "ad-" seçicisine takılmaz (tourismtoday "payload-richtext")', () => {
    const html = `<html><body><div class="prose"><h1>Aşçılar nereye koşuyor?</h1>
      <div class="payload-richtext max-w-none">${PARA(5)}<div class="ad-slot">Reklam</div></div></div></body></html>`
    const e = extractArticle(html, 'https://www.tourismtoday.net/turizm-haberleri/kose-yazilari/x', 'tr')
    expect(e.extractionMethod).toBe('domain-rule')
    expect(e.wordCount).toBeGreaterThan(40)
    expect(e.articleBodyText).not.toContain('Reklam')
  })

  it('"widget" sınıflı <article> içindeki gövde (simpleflying)', () => {
    const html = `<html><body><main><article class="w-article widget article"><h1>China completes first flight</h1>
      <section class="article-body"><div class="content-block-regular">${PARA(5)}</div></section></article></main></body></html>`
    const e = extractArticle(html, 'https://simpleflying.com/ce-25a-first-flight', 'en')
    expect(e.extractionMethod).toBe('domain-rule')
  })
})

function src(partial: Partial<NewsSourceRecord>): NewsSourceRecord {
  return { id: 's', name: 'S', domain: 'x.com', registryKey: null, sourceCategory: 'GENERAL', city: null, ...partial } as NewsSourceRecord
}

describe('TOURISM-SRC-1 kategori', () => {
  const tourism = src({ sourceCategory: 'TOURISM', name: 'Turizm News' })
  const general = src({ sourceCategory: 'GENERAL' })

  it('kümedeki bütün kaynaklar turizm → turizm; karışık küme metin ipucuna kalır', () => {
    expect(tourismCategoryHint([tourism, tourism])).toBe('turizm')
    expect(tourismCategoryHint([tourism, general])).toBeNull()
    expect(tourismCategoryHint([])).toBeNull()
    expect(isTourismSource(general)).toBe(false)
  })

  it('turizm kaynağından elle taslak Turizm kategorisiyle açılır; diğerleri değişmez', () => {
    const article = { id: 'a', sourceId: 's', title: 'THY Japonya', description: null, articleBodyText: 'x', city: null, countryCode: 'TR', imageUrls: [], mainImageUrl: null, originalUrl: 'https://t/1', canonicalUrl: null, publishedAt: null } as unknown as RawArticleRecord
    expect(draftPrefillFromRaw(article, tourism).categoryId).toBe('turizm')
    expect((draftPrefillFromRaw(article, general) as { categoryId?: string }).categoryId).toBeUndefined()
  })

  it('sondakika il sayfasının ili taslağa geçmez (yalnız haberin ili)', () => {
    const sd = src({ domain: 'sondakika.com', registryKey: 'sondakika-il-adana', city: 'Adana' })
    const noCity = { id: 'a', sourceId: 's', title: 'x', city: null, imageUrls: [], originalUrl: 'https://t/1' } as unknown as RawArticleRecord
    expect(draftPrefillFromRaw(noCity, sd).citySlug).toBeNull()
    expect(draftPrefillFromRaw({ ...noCity, city: 'Osmaniye' } as RawArticleRecord, sd).citySlug).toBe('osmaniye')
    const local = src({ domain: 'canakkaleolay.com', city: 'Çanakkale' })
    expect(draftPrefillFromRaw(noCity, local).citySlug).toBe('canakkale')
  })
})
