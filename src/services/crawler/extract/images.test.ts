import { describe, expect, it } from 'vitest'
import { decodeForDisplay, decodeHtmlEntities } from './htmlEntities'
import { extractEditorialImages, pickBestSrcsetUrl } from './images'
import { numberedPages, paginateRawArticles } from '../editorial/query'
import { crawlerStatusLabel, EDITORIAL_STATUS_LABELS } from '../editorial/labels'
import { namedTokensMatch, normalizeNewsText } from '../cluster/normalize'
import type { RawArticleListRow } from '../store/types'

describe('html entity decode (display only)', () => {
  it('decodes common entities without mutating evidence semantics', () => {
    expect(decodeHtmlEntities('It&#039;s &amp; &quot;ok&quot; &lt;b&gt;')).toBe('It\'s & "ok" <b>')
    expect(decodeForDisplay('İstanbul&#039;da &amp; yangın')).toBe("İstanbul'da & yangın")
  })
})

describe('editorial images', () => {
  it('rejects logos, avatars, tracking pixels and tiny thumbs', () => {
    const html = `<html><body>
      <article>
        <img src="https://news.test/logo.png" class="site-logo" width="80" height="80" />
        <img src="https://news.test/avatar.jpg" class="author-avatar" width="48" height="48" />
        <img src="https://news.test/pixel.gif" width="1" height="1" />
        <img src="https://news.test/story-hero.jpg" width="1200" height="800" alt="Yangın" />
      </article>
    </body></html>`
    const result = extractEditorialImages(html, 'https://news.test/story')
    expect(result.rejected.some((c) => c.rejectionReason === 'logo_or_favicon')).toBe(true)
    expect(result.rejected.some((c) => c.rejectionReason === 'avatar')).toBe(true)
    expect(result.rejected.some((c) => c.rejectionReason === 'tracking_pixel')).toBe(true)
    expect(result.primary?.sourceUrl).toContain('story-hero.jpg')
  })

  it('prefers JSON-LD / OG over in-body images', () => {
    const html = `<html><head>
      <meta property="og:image" content="https://news.test/og-wide.jpg" />
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'NewsArticle',
        image: 'https://news.test/ld-hero.jpg',
      })}</script>
    </head><body><article>
      <img src="https://news.test/inline.jpg" width="400" height="300" />
    </article></body></html>`
    const result = extractEditorialImages(html, 'https://news.test/a')
    expect(result.primary?.discoveryMethod === 'jsonld' || result.primary?.discoveryMethod === 'og').toBe(true)
  })

  it('picks the largest srcset candidate', () => {
    const picked = pickBestSrcsetUrl(
      'https://news.test/a.jpg 400w, https://news.test/b.jpg 1200w',
      'https://news.test/story'
    )
    expect(picked?.url).toContain('b.jpg')
  })
})

describe('cluster normalize', () => {
  it('decodes entities before clustering and matches Alparslan/Alpaslan-style names', () => {
    expect(normalizeNewsText('Alparslan&#039;ın açıklaması', 'tr')).toContain('alparslan')
    expect(namedTokensMatch('alparslan', 'alpaslan')).toBe(true)
  })
})

describe('raw article pagination helper', () => {
  it('pages server-style with filtered totals', () => {
    const rows = Array.from({ length: 68 }, (_, i) => ({
      id: `raw_${i}`,
      sourceId: i % 2 === 0 ? 's1' : 's2',
      sourceName: i % 2 === 0 ? 'Anadolu Ajansı' : 'DHA',
      title: `Haber ${i}`,
      fetchedAt: new Date(2026, 7, 19, 12, i),
      publishedAt: null,
      countryCode: 'TR',
      city: null,
      isExactDuplicate: false,
      qualityStatus: 'EXTRACTED',
      editorialStatus: 'NEW',
      mainImageUrl: i % 3 === 0 ? 'https://x.test/a.jpg' : null,
      imageUrls: [],
    })) as unknown as RawArticleListRow[]
    const page2 = paginateRawArticles(rows, { page: 2, pageSize: 25 })
    expect(page2.articles).toHaveLength(25)
    expect(page2.total).toBe(68)
    expect(page2.page).toBe(2)
    expect(page2.summary.total).toBe(68)
    expect(numberedPages(4, 20)).toContain(1)
    expect(numberedPages(4, 20)).toContain(20)
  })
})

describe('turkish ui mapping', () => {
  it('maps editorial and crawler statuses', () => {
    expect(EDITORIAL_STATUS_LABELS.NEW).toBe('Yeni')
    expect(EDITORIAL_STATUS_LABELS.DRAFT).toBe('Taslak Oluşturuldu')
    expect(crawlerStatusLabel({ isExactDuplicate: true, qualityStatus: 'EXTRACTED' })).toBe('Mükerrer')
  })
})
