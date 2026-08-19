import { describe, expect, it } from 'vitest'
import { EDITORIAL_STATUS_LABELS, QUALITY_STATUS_LABELS, crawlerStatusLabel } from './labels'
import { draftPrefillFromRaw } from './prefill'
import { decodeForDisplay } from '../extract/htmlEntities'
import type { NewsSourceRecord, RawArticleRecord } from '../types'

describe('editorial UI mapping', () => {
  it('keeps crawler status separate from editorial status', () => {
    expect(EDITORIAL_STATUS_LABELS.PUBLISHED).toBe('Yayınlandı')
    expect(QUALITY_STATUS_LABELS.EXTRACTED).toBe('Çıkarıldı')
    expect(crawlerStatusLabel({ isExactDuplicate: false, qualityStatus: 'LOW_CONFIDENCE' })).toBe('Düşük güven')
  })

  it('prefills draft from raw evidence without fabricating SEO fields', () => {
    const article = {
      id: 'raw_1',
      sourceId: 'src_1',
      title: 'Belediye&#039;den &amp; açıklama',
      description: null,
      articleBodyText: 'Gövde &quot;metin&quot;',
      articleBodyHtml: null,
      mainImageUrl: 'https://news.test/a.jpg',
      imageUrls: ['https://news.test/a.jpg', 'https://news.test/b.jpg'],
      canonicalUrl: 'https://news.test/haber',
      originalUrl: 'https://news.test/haber?utm=1',
      city: 'Çanakkale',
      publishedAt: new Date('2026-08-19T08:00:00Z'),
    } as RawArticleRecord
    const source = { id: 'src_1', name: 'Anadolu Ajansı' } as NewsSourceRecord
    const prefill = draftPrefillFromRaw(article, source)
    expect(prefill.title).toBe(decodeForDisplay("Belediye'den & açıklama".replace("'", "'")))
    expect(prefill.title).toContain('Belediye')
    expect(prefill.title).not.toContain('&#039;')
    expect(prefill.sourceLabel).toBe('Anadolu Ajansı')
    expect(prefill.rssGuid).toBe('raw_1')
    expect(prefill.citySlug).toBe('canakkale')
  })
})
