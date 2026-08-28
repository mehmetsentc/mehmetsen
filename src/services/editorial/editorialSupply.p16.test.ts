import { describe, expect, it } from 'vitest'
import { selectPrimarySource, scoreArticleCandidate } from './primarySourceSelector'
import { validateEditorialCandidate, normalizeEditorialCategory, cleanTextContent, generateCleanSummary } from './editorialQualityGate'
import { validateImageCandidate, selectBestEditorialImage } from './imageGate'
import type { EditorialCandidateArticle } from './editorialTypes'

describe('Phase P16 — Editorial Supply & Quality Gates', () => {
  describe('1. Clean Image Gate', () => {
    it('rejects tracking pixels and beacons', () => {
      expect(validateImageCandidate('https://example.com/pixel.gif').valid).toBe(false)
      expect(validateImageCandidate('https://example.com/track/1x1.png').valid).toBe(false)
      expect(validateImageCandidate('https://example.com/beacon/stats.jpg').valid).toBe(false)
      expect(validateImageCandidate('https://example.com/analytics/transparent.png').valid).toBe(false)
    })

    it('rejects ad network banners', () => {
      expect(validateImageCandidate('https://ad.doubleclick.net/banner.jpg').valid).toBe(false)
      expect(validateImageCandidate('https://example.com/pagead/ad-banner.png').valid).toBe(false)
      expect(validateImageCandidate('https://example.com/banners/ad_728x90.jpg').valid).toBe(false)
    })

    it('accepts clean news images', () => {
      const res = validateImageCandidate('https://cdn.example.com/news/2026/08/istanbul-bogaz.jpg', {
        width: 1200,
        height: 675,
      })
      expect(res.valid).toBe(true)
      expect(res.url).toBe('https://cdn.example.com/news/2026/08/istanbul-bogaz.jpg')
    })

    it('selects best primary image from candidate list', () => {
      const candidates = [
        { url: 'https://example.com/pixel.gif', isPrimary: true },
        { url: 'https://cdn.example.com/images/news-hero.jpg', isPrimary: false, width: 800, height: 600 },
      ]
      const best = selectBestEditorialImage(candidates)
      expect(best).toBe('https://cdn.example.com/images/news-hero.jpg')
    })
  })

  describe('2. Editorial Quality Gate', () => {
    it('sanitizes HTML entities and excess whitespace', () => {
      const raw = 'Cumhurbaşkanı&#039;ndan &quot;yeni karar&quot; &nbsp; &nbsp; açıklaması'
      expect(cleanTextContent(raw)).toBe('Cumhurbaşkanı\'ndan "yeni karar" açıklaması')
    })

    it('rejects placeholder and dummy text', () => {
      const res = validateEditorialCandidate({
        title: 'Lorem ipsum dolor sit amet test',
        body: 'Bu bir lorem ipsum test makalesidir ve gerçek haber değildir.',
      })
      expect(res.passed).toBe(false)
      expect(res.issues).toContain('CONTAINS_PLACEHOLDER_TEXT')
    })

    it('rejects overly short titles and thin bodies', () => {
      const res = validateEditorialCandidate({
        title: 'Kısa başlık',
        body: 'Çok kısa gövde.',
      })
      expect(res.passed).toBe(false)
      expect(res.issues).toContain('TITLE_TOO_SHORT')
      expect(res.issues).toContain('BODY_TOO_SHORT')
    })

    it('normalizes categories deterministically', () => {
      expect(normalizeEditorialCategory('gündem')).toBe('gundem')
      expect(normalizeEditorialCategory('politika')).toBe('siyaset')
      expect(normalizeEditorialCategory(null, 'Galatasaray ve Fenerbahçe transferde karşı karşıya')).toBe('spor')
      expect(normalizeEditorialCategory(null, 'Merkez Bankası faiz ve enflasyon verilerini açıkladı')).toBe('ekonomi')
      expect(normalizeEditorialCategory(null, 'Çanakkale Boğazı gemi trafiğine kapatıldı')).toBe('yerel-haber')
    })

    it('generates clean summary from first sentences', () => {
      const body = 'İstanbul Boğazı sis nedeniyle çift yönlü gemi geçişine kapatıldı. Kıyı Emniyeti Genel Müdürlüğü açıklama yaptı.'
      const summary = generateCleanSummary(body)
      expect(summary).toBe('İstanbul Boğazı sis nedeniyle çift yönlü gemi geçişine kapatıldı. Kıyı Emniyeti Genel Müdürlüğü açıklama yaptı.')
    })
  })

  describe('3. Deterministic Primary Source Selector', () => {
    const makeCandidate = (overrides: Partial<EditorialCandidateArticle>): EditorialCandidateArticle => ({
      id: 'raw_1',
      sourceId: 'src_1',
      sourceName: 'Test Source',
      sourceQualityTier: 'TIER_B',
      sourceHealthScore: 80,
      sourceStatus: 'ACTIVE',
      title: 'Önemli Gelişme Başlığı',
      description: 'Özet metni',
      body: 'Bu kapsamlı ve detaylı bir haber metnidir. İçeriğinde tüm ayrıntılar yer almaktadır.',
      canonicalUrl: 'https://source.com/article/1',
      originalUrl: 'https://source.com/article/1',
      mainImageUrl: 'https://source.com/img.jpg',
      imageUrls: [],
      publishedAt: new Date('2026-08-28T12:00:00Z'),
      fetchedAt: new Date('2026-08-28T12:05:00Z'),
      wordCount: 150,
      charCount: 900,
      extractionConfidence: 0.95,
      city: null,
      district: null,
      countryCode: 'TR',
      ...overrides,
    })

    it('ranks TIER_A and high health source above TIER_C source', () => {
      const candA = makeCandidate({
        id: 'raw_a',
        sourceId: 'src_a',
        sourceName: 'Cumhuriyet',
        sourceQualityTier: 'TIER_A',
        sourceHealthScore: 95,
      })
      const candC = makeCandidate({
        id: 'raw_c',
        sourceId: 'src_c',
        sourceName: 'Küçük Kaynak',
        sourceQualityTier: 'TIER_C',
        sourceHealthScore: 40,
      })

      const primary = selectPrimarySource([candC, candA])
      expect(primary).not.toBeNull()
      expect(primary!.primaryArticleId).toBe('raw_a')
      expect(primary!.sourceName).toBe('Cumhuriyet')
    })

    it('rejects BLOCKED and DISABLED sources', () => {
      const candBlocked = makeCandidate({
        id: 'raw_blocked',
        sourceQualityTier: 'BLOCKED',
      })
      const { score } = scoreArticleCandidate(candBlocked)
      expect(score).toBeLessThan(0)
    })

    it('provides deterministic tie-breaking for equal scores', () => {
      const cand1 = makeCandidate({ id: 'raw_aaa', sourceId: 'src_1' })
      const cand2 = makeCandidate({ id: 'raw_bbb', sourceId: 'src_2' })
      const sel1 = selectPrimarySource([cand1, cand2])
      const sel2 = selectPrimarySource([cand2, cand1])
      expect(sel1?.primaryArticleId).toBe(sel2?.primaryArticleId)
    })
  })
})
