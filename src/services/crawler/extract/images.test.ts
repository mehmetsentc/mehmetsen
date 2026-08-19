import { describe, expect, it } from 'vitest'
import { decodeForDisplay, decodeHtmlEntities } from './htmlEntities'
import { extractEditorialImages, pickBestSrcsetUrl, selectEditorialHandoff } from './images'
import {
  fixtureAds,
  fixtureGallery,
  fixtureJsonLdArray,
  fixtureLazyLoad,
  fixtureOgOnly,
  fixtureRelatedNews,
  fixtureSidebar,
  fixtureSrcsetPicture,
  IMAGE_FIXTURE_URLS,
} from './imageFixtures'
import { imageVariantKey, normalizeImageUrl } from './imageNormalize'
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

  it('collapses Swiss-flag CDN/size variants to one accepted image', () => {
    const html = `<html><body><article>
      <img src="http://www.cdn.news.test/swiss-flag.jpg?w=300" width="300" height="200" alt="İsviçre" />
      <img src="https://cdn.news.test/swiss-flag.jpg?w=600&amp;utm_source=rss" width="600" height="400" />
      <img src="https://cdn.news.test/swiss-flag.jpg?w=1200#frag" width="1200" height="800" />
      <img src="https://cdn.news.test/swiss-flag-1200x800.jpg" width="1200" height="800" />
    </article></body></html>`
    const result = extractEditorialImages(html, 'https://news.test/story')
    const swiss = result.accepted.filter((c) => /swiss-flag/.test(c.sourceUrl) || /swiss-flag/.test(c.normalizedUrl))
    expect(swiss).toHaveLength(1)
    expect(result.duplicateCount).toBeGreaterThanOrEqual(3)
  })

  it('rejects Sözcü promo, ad banners and product ads; accepts real photos', () => {
    const html = `<html><body>
      <aside class="reklam-alani">
        <img src="https://www.sozcu.com.tr/wp-content/uploads/reklam/sozcu-abone-banner.jpg" class="promo-banner" alt="Sözcü abone kampanya" width="728" height="90" />
      </aside>
      <header>
        <img src="https://ads.doubleclick.net/ad/kampanya-banner.jpg" class="ad-banner" alt="Reklam" width="970" height="90" />
      </header>
      <div class="widget sponsored-product">
        <img src="https://shop.test/affiliate/buy-now-watch.jpg" class="product-ad" alt="Satın al" width="400" height="400" />
      </div>
      <article>
        <figure>
          <img src="https://news.test/photos/fire-1.jpg" width="1200" height="800" alt="Yangın" />
        </figure>
        <img src="https://news.test/photos/fire-2.jpg" width="900" height="600" alt="Ekipler" />
        <img src="https://news.test/photos/unknown-dims.jpg" alt="Sahne" />
        <img src="https://news.test/photos/press.jpg" width="800" height="500" alt="Belediye reklam panosunu kaldırdı" />
      </article>
    </body></html>`
    const result = extractEditorialImages(html, 'https://news.test/story')
    expect(result.accepted.some((c) => /sozcu-abone/.test(c.sourceUrl))).toBe(false)
    expect(result.accepted.some((c) => /doubleclick|kampanya-banner/.test(c.sourceUrl))).toBe(false)
    expect(result.accepted.some((c) => /buy-now/.test(c.sourceUrl))).toBe(false)
    expect(result.accepted.some((c) => c.sourceUrl.includes('fire-1.jpg'))).toBe(true)
    expect(result.accepted.some((c) => c.sourceUrl.includes('fire-2.jpg'))).toBe(true)
    expect(result.accepted.some((c) => c.sourceUrl.includes('unknown-dims.jpg'))).toBe(true)
    expect(result.accepted.some((c) => c.sourceUrl.includes('press.jpg'))).toBe(true)
    expect(result.primary?.status).toBe('ACCEPTED')
    expect(result.primary?.rejectionReason).toBeNull()
  })

  it('does not make a rejected JSON-LD image primary', () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'NewsArticle',
        image: 'https://news.test/reklam/promo-banner.jpg',
      })}</script>
    </head><body><article>
      <img src="https://news.test/photos/real.jpg" width="1000" height="700" alt="Haber" />
    </article></body></html>`
    const result = extractEditorialImages(html, 'https://news.test/a')
    expect(result.primary?.sourceUrl).toContain('real.jpg')
    expect(result.rejected.some((c) => c.sourceUrl.includes('promo-banner'))).toBe(true)
  })

  it('keeps the best 9 images by default (1 primary + 8 extras), not the first DOM nodes', () => {
    const early = Array.from(
      { length: 12 },
      (_, i) => `<img src="https://news.test/photos/early${i}.jpg" width="400" height="300" alt="erken ${i}" />`
    ).join('')
    const heroes = Array.from(
      { length: 5 },
      (_, i) => `<img src="https://news.test/photos/hero${i}.jpg" width="1600" height="900" alt="Manşet ${i}" />`
    ).join('')
    const html = `<html><body><article>${early}${heroes}</article></body></html>`
    const result = extractEditorialImages(html, 'https://news.test/story')
    expect(result.accepted.length).toBeLessThanOrEqual(9)
    expect(result.accepted.filter((c) => /hero/.test(c.sourceUrl)).length).toBe(5)
    expect(result.rejected.some((c) => c.rejectionReason === 'over_max_editorial')).toBe(true)
  })

  it('rejects unrelated related-news / sidebar / ads and keeps the hero', () => {
    const related = extractEditorialImages(fixtureRelatedNews(), 'https://news.test/cinema')
    expect(related.accepted.some((c) => c.sourceUrl === IMAGE_FIXTURE_URLS.RELATED)).toBe(false)
    expect(related.primary?.sourceUrl).toBe(IMAGE_FIXTURE_URLS.HERO)

    const sidebar = extractEditorialImages(fixtureSidebar(), 'https://news.test/cinema')
    expect(sidebar.accepted.some((c) => c.sourceUrl === IMAGE_FIXTURE_URLS.SIDEBAR)).toBe(false)
    expect(sidebar.primary?.sourceUrl).toBe(IMAGE_FIXTURE_URLS.HERO)

    const ads = extractEditorialImages(fixtureAds(), 'https://news.test/cinema')
    expect(ads.accepted.some((c) => c.sourceUrl.includes('banner') || c.sourceUrl.includes('kampanya'))).toBe(false)
    expect(ads.primary?.sourceUrl).toBe(IMAGE_FIXTURE_URLS.HERO)
  })

  it('keeps gallery figures and still rejects related thumbs', () => {
    const result = extractEditorialImages(fixtureGallery(), 'https://news.test/gallery')
    expect(result.accepted.some((c) => c.sourceUrl === IMAGE_FIXTURE_URLS.GALLERY_1)).toBe(true)
    expect(result.accepted.some((c) => c.sourceUrl === IMAGE_FIXTURE_URLS.GALLERY_2)).toBe(true)
    expect(result.accepted.some((c) => c.sourceUrl === IMAGE_FIXTURE_URLS.RELATED)).toBe(false)
    expect(result.primary?.imageSource === 'jsonld' || result.primary?.imageSource === 'article_body').toBe(true)
  })

  it('uses og:image when the page has no article body images', () => {
    const result = extractEditorialImages(fixtureOgOnly(), 'https://news.test/og')
    expect(result.primary?.sourceUrl).toBe(IMAGE_FIXTURE_URLS.OG)
    expect(result.primary?.imageSource).toBe('og')
    expect(result.accepted.some((c) => c.sourceUrl === IMAGE_FIXTURE_URLS.RELATED)).toBe(false)
  })

  it('accepts JSON-LD image arrays with jsonld provenance', () => {
    const result = extractEditorialImages(fixtureJsonLdArray(), 'https://news.test/ld')
    expect(result.accepted.map((c) => c.sourceUrl)).toEqual(
      expect.arrayContaining([IMAGE_FIXTURE_URLS.LD_A, IMAGE_FIXTURE_URLS.LD_B])
    )
    expect(result.primary?.imageSource).toBe('jsonld')
    expect(result.primary?.imageConfidence).toBeGreaterThan(0.8)
  })

  it('reads lazy-loaded article images and ignores lazy related thumbs', () => {
    const result = extractEditorialImages(fixtureLazyLoad(), 'https://news.test/lazy')
    expect(result.primary?.sourceUrl).toBe(IMAGE_FIXTURE_URLS.LAZY)
    expect(result.accepted.some((c) => c.sourceUrl === IMAGE_FIXTURE_URLS.RELATED)).toBe(false)
  })

  it('picks srcset/picture hero and rejects carousel-outside-body', () => {
    const result = extractEditorialImages(fixtureSrcsetPicture(), 'https://news.test/srcset')
    expect(result.primary?.sourceUrl).toBe(IMAGE_FIXTURE_URLS.SRCSET)
    expect(result.accepted.some((c) => c.sourceUrl === IMAGE_FIXTURE_URLS.RELATED)).toBe(false)
  })

  it('hands off only ACCEPTED unique images with a single primary', () => {
    const html = `<html><body><article>
      <img src="https://news.test/a.jpg?w=300" width="300" height="200" />
      <img src="https://news.test/a.jpg?w=900" width="900" height="600" />
      <img src="https://news.test/b.jpg" width="800" height="500" />
    </article></body></html>`
    const handoff = selectEditorialHandoff(extractEditorialImages(html, 'https://news.test/s'))
    expect(handoff.primaryUrl).toBeTruthy()
    expect(new Set([handoff.primaryUrl, ...handoff.extraUrls]).size).toBe((handoff.primaryUrl ? 1 : 0) + handoff.extraUrls.length)
  })
})

describe('image url normalize', () => {
  it('strips tracking, fragment, www and http; CDN sizes share a variant key', () => {
    const a = normalizeImageUrl('HTTP://WWW.CDN.test/img.jpg?w=300&utm_source=x#h')
    const b = normalizeImageUrl('https://cdn.test/img.jpg?w=1200')
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    expect(imageVariantKey(a!)).toBe(imageVariantKey(b!))
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
