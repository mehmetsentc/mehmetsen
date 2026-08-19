import * as cheerio from 'cheerio'
import type { Element } from 'domhandler'
import { normalizeArticleUrl } from '../url/normalize'
import { extractJsonLdArticle } from './jsonld'
import { extractOpenGraph } from './opengraph'

export type ImageDiscoveryMethod =
  | 'jsonld'
  | 'jsonld_object'
  | 'og'
  | 'twitter'
  | 'article_dom'
  | 'figure'
  | 'srcset'
  | 'extractor'

export interface ImageCandidate {
  sourceUrl: string
  normalizedUrl: string
  width: number | null
  height: number | null
  alt: string | null
  caption: string | null
  credit: string | null
  mimeType: string | null
  discoveryMethod: ImageDiscoveryMethod
  inArticle: boolean
  inFigure: boolean
  score: number
  status: 'ACCEPTED' | 'REJECTED'
  rejectionReason: string | null
}

export interface EditorialImageResult {
  primary: ImageCandidate | null
  accepted: ImageCandidate[]
  rejected: ImageCandidate[]
  candidates: ImageCandidate[]
  imageCount: number
}

const REJECT_URL =
  /logo|favicon|sprite|pixel|tracking|1x1|spacer|advert|\/ads?\/|banner|avatar|profile.?photo|author.?img|placeholder|dummy|blank\.gif|share[-_]?icon|social[-_]?icon|apple-touch|mstile/i

const REJECT_ATTR = /\b(logo|avatar|author|byline|share|social|sprite|icon|ad-?banner|advert)\b/i

function mimeFromUrl(url: string): string | null {
  const path = url.split('?')[0]?.toLowerCase() || ''
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.gif')) return 'image/gif'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  return null
}

function intAttr(value: string | undefined): number | null {
  if (!value) return null
  const n = Number.parseInt(value.replace(/px$/i, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function pickBestSrcsetUrl(
  srcset: string,
  pageUrl: string
): { url: string; width: number | null } | null {
  let best: { url: string; width: number; density: number } | null = null
  for (const part of srcset.split(',')) {
    const bits = part.trim().split(/\s+/)
    const raw = bits[0]
    if (!raw) continue
    const url = normalizeArticleUrl(raw, pageUrl)
    if (!url) continue
    let width = 0
    let density = 1
    for (const bit of bits.slice(1)) {
      if (/^\d+w$/i.test(bit)) width = Number.parseInt(bit, 10)
      if (/^\d+(\.\d+)?x$/i.test(bit)) density = Number.parseFloat(bit)
    }
    const rank = width || density * 1000
    if (!best || rank > best.width) best = { url, width: width || 0, density }
  }
  if (!best) return null
  return { url: best.url, width: best.width > 0 ? best.width : null }
}

function rejectReason(input: {
  url: string
  width: number | null
  height: number | null
  alt: string | null
  classOrId: string
  inNavChrome: boolean
  method: ImageDiscoveryMethod
}): string | null {
  const url = input.url.toLowerCase()
  if (url.startsWith('data:')) return 'data_uri'
  if (url.startsWith('blob:')) return 'blob_uri'
  if (REJECT_URL.test(url)) {
    if (/logo|favicon/.test(url)) return 'logo_or_favicon'
    if (/avatar|profile/.test(url)) return 'avatar'
    if (/advert|\/ads?\/|banner/.test(url)) return 'ad_or_banner'
    if (/sprite|icon|share|social/.test(url)) return 'social_or_sprite'
    if (/pixel|1x1|tracking|spacer/.test(url)) return 'tracking_pixel'
    if (/placeholder|dummy|blank/.test(url)) return 'placeholder'
    return 'non_editorial_url'
  }
  if (input.width === 1 && input.height === 1) return 'tracking_pixel'
  if (input.width != null && input.height != null && input.width <= 2 && input.height <= 2) {
    return 'tracking_pixel'
  }
  if (REJECT_ATTR.test(input.classOrId) || REJECT_ATTR.test(input.alt || '')) {
    if (/logo/.test(input.classOrId) || /logo/.test(input.alt || '')) return 'logo_or_favicon'
    if (/avatar|author|byline/.test(input.classOrId)) return 'avatar'
    if (/advert|banner/.test(input.classOrId)) return 'ad_or_banner'
    return 'non_editorial_attr'
  }
  if (input.inNavChrome && input.method !== 'jsonld' && input.method !== 'jsonld_object' && input.method !== 'og') {
    return 'navigation_chrome'
  }
  const mime = mimeFromUrl(input.url)
  if (mime === 'image/svg+xml' && /logo|icon/.test(url)) return 'logo_or_favicon'
  return null
}

function scoreCandidate(c: ImageCandidate, articleUrl: string, largestWidth: number | null): number {
  let score = 0
  if (c.discoveryMethod === 'jsonld' || c.discoveryMethod === 'jsonld_object') score += 100
  else if (c.discoveryMethod === 'og') score += 80
  else if (c.discoveryMethod === 'twitter') score += 70
  else if (c.discoveryMethod === 'article_dom') score += 60
  else if (c.discoveryMethod === 'figure') score += 55
  else if (c.discoveryMethod === 'srcset') score += 50
  else score += 30
  if (c.inArticle) score += 12
  if (c.inFigure) score += 8
  if (c.caption) score += 10
  if (c.credit) score += 4
  if (c.width && c.width >= 600) score += Math.min(24, Math.round(c.width / 80))
  else if (c.width && c.width >= 240) score += 6
  if (largestWidth && c.width && c.width < 120 && largestWidth >= 400) score -= 40
  try {
    const imgPath = new URL(c.sourceUrl).pathname
    const artPath = new URL(articleUrl).pathname
    const imgBits = imgPath.split('/').filter(Boolean)
    const artBits = artPath.split('/').filter(Boolean)
    if (imgBits.some((b) => artBits.includes(b) && b.length > 4)) score += 8
  } catch {
    /* ignore */
  }
  if (c.status === 'REJECTED') score -= 200
  return score
}

function pushCandidate(
  list: ImageCandidate[],
  seen: Set<string>,
  partial: Omit<ImageCandidate, 'score' | 'status' | 'rejectionReason' | 'normalizedUrl'> & {
    normalizedUrl?: string | null
  },
  reject: string | null
): void {
  const normalized = partial.normalizedUrl || normalizeArticleUrl(partial.sourceUrl)
  if (!normalized) return
  if (seen.has(normalized)) return
  seen.add(normalized)
  list.push({
    ...partial,
    sourceUrl: partial.sourceUrl,
    normalizedUrl: normalized,
    score: 0,
    status: reject ? 'REJECTED' : 'ACCEPTED',
    rejectionReason: reject,
  })
}

function collectJsonLdImages(html: string, pageUrl: string): Array<{
  url: string
  method: ImageDiscoveryMethod
  width: number | null
  height: number | null
  caption: string | null
  credit: string | null
}> {
  const out: Array<{
    url: string
    method: ImageDiscoveryMethod
    width: number | null
    height: number | null
    caption: string | null
    credit: string | null
  }> = []
  const $ = cheerio.load(html)
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).contents().text()
    if (!raw.trim()) return
    try {
      const parsed = JSON.parse(raw) as unknown
      walkImages(parsed, pageUrl, out)
    } catch {
      /* ignore malformed */
    }
  })
  const fallback = extractJsonLdArticle(html, pageUrl)
  if (fallback) {
    for (const url of fallback.imageUrls) {
      if (!out.some((x) => x.url === url)) {
        out.push({ url, method: 'jsonld', width: null, height: null, caption: null, credit: null })
      }
    }
  }
  return out
}

function walkImages(
  node: unknown,
  pageUrl: string,
  acc: Array<{
    url: string
    method: ImageDiscoveryMethod
    width: number | null
    height: number | null
    caption: string | null
    credit: string | null
  }>
): void {
  if (!node) return
  if (Array.isArray(node)) {
    for (const child of node) walkImages(child, pageUrl, acc)
    return
  }
  if (typeof node !== 'object') return
  const rec = node as Record<string, unknown>
  const types = Array.isArray(rec['@type']) ? rec['@type'] : rec['@type'] ? [rec['@type']] : []
  const typeNames = types.map((t) => String(t).split('/').pop())
  const isArticle = typeNames.some((t) =>
    ['NewsArticle', 'Article', 'ReportageNewsArticle', 'LiveBlogPosting', 'BlogPosting'].includes(t || '')
  )
  const isImage = typeNames.includes('ImageObject')
  if (isImage) {
    const url = normalizeArticleUrl(String(rec.contentUrl || rec.url || rec['@id'] || ''), pageUrl)
    if (url) {
      acc.push({
        url,
        method: 'jsonld_object',
        width: typeof rec.width === 'number' ? rec.width : intAttr(String(rec.width || '')),
        height: typeof rec.height === 'number' ? rec.height : intAttr(String(rec.height || '')),
        caption: typeof rec.caption === 'string' ? rec.caption : null,
        credit: typeof rec.creditText === 'string' ? rec.creditText : typeof rec.author === 'string' ? rec.author : null,
      })
    }
  }
  if (isArticle && rec.image) {
    const images = Array.isArray(rec.image) ? rec.image : [rec.image]
    for (const img of images) {
      if (typeof img === 'string') {
        const url = normalizeArticleUrl(img, pageUrl)
        if (url) acc.push({ url, method: 'jsonld', width: null, height: null, caption: null, credit: null })
      } else {
        walkImages(img, pageUrl, acc)
        if (img && typeof img === 'object') {
          const recImg = img as Record<string, unknown>
          const url = normalizeArticleUrl(String(recImg.contentUrl || recImg.url || ''), pageUrl)
          if (url && !acc.some((x) => x.url === url)) {
            acc.push({
              url,
              method: 'jsonld_object',
              width: typeof recImg.width === 'number' ? recImg.width : null,
              height: typeof recImg.height === 'number' ? recImg.height : null,
              caption: typeof recImg.caption === 'string' ? recImg.caption : null,
              credit: null,
            })
          }
        }
      }
    }
  }
  if (rec['@graph']) walkImages(rec['@graph'], pageUrl, acc)
}

function chromeContext($: cheerio.CheerioAPI, el: Element): boolean {
  return $(el).parents('header, nav, footer, aside, [role="banner"], [role="navigation"]').length > 0
}

export function extractEditorialImages(html: string, pageUrl: string): EditorialImageResult {
  const $ = cheerio.load(html)
  const seen = new Set<string>()
  const collected: ImageCandidate[] = []
  const og = extractOpenGraph(html, pageUrl)

  for (const img of collectJsonLdImages(html, pageUrl)) {
    const reject = rejectReason({
      url: img.url,
      width: img.width,
      height: img.height,
      alt: img.caption,
      classOrId: '',
      inNavChrome: false,
      method: img.method,
    })
    pushCandidate(
      collected,
      seen,
      {
        sourceUrl: img.url,
        width: img.width,
        height: img.height,
        alt: img.caption,
        caption: img.caption,
        credit: img.credit,
        mimeType: mimeFromUrl(img.url),
        discoveryMethod: img.method,
        inArticle: true,
        inFigure: false,
      },
      reject
    )
  }

  const ogUrl = og.image ? normalizeArticleUrl(og.image, pageUrl) : null
  if (ogUrl) {
    const ogWidth = intAttr($('meta[property="og:image:width"]').attr('content'))
    const ogHeight = intAttr($('meta[property="og:image:height"]').attr('content'))
    pushCandidate(
      collected,
      seen,
      {
        sourceUrl: ogUrl,
        width: ogWidth,
        height: ogHeight,
        alt: $('meta[property="og:image:alt"]').attr('content')?.trim() || null,
        caption: null,
        credit: null,
        mimeType: mimeFromUrl(ogUrl),
        discoveryMethod: 'og',
        inArticle: false,
        inFigure: false,
      },
      rejectReason({
        url: ogUrl,
        width: ogWidth,
        height: ogHeight,
        alt: null,
        classOrId: '',
        inNavChrome: false,
        method: 'og',
      })
    )
  }

  const tw =
    $('meta[name="twitter:image"]').attr('content')?.trim() ||
    $('meta[property="twitter:image"]').attr('content')?.trim() ||
    null
  const twUrl = tw ? normalizeArticleUrl(tw, pageUrl) : null
  if (twUrl) {
    pushCandidate(
      collected,
      seen,
      {
        sourceUrl: twUrl,
        width: null,
        height: null,
        alt: $('meta[name="twitter:image:alt"]').attr('content')?.trim() || null,
        caption: null,
        credit: null,
        mimeType: mimeFromUrl(twUrl),
        discoveryMethod: 'twitter',
        inArticle: false,
        inFigure: false,
      },
      rejectReason({
        url: twUrl,
        width: null,
        height: null,
        alt: null,
        classOrId: '',
        inNavChrome: false,
        method: 'twitter',
      })
    )
  }

  const visitImg = (el: Element, method: ImageDiscoveryMethod) => {
    const node = $(el)
    const srcset = node.attr('srcset') || node.parent('picture').find('source').attr('srcset')
    const picked = srcset ? pickBestSrcsetUrl(srcset, pageUrl) : null
    const rawSrc = node.attr('src') || node.attr('data-src') || node.attr('data-original') || picked?.url
    if (!rawSrc) return
    const url = normalizeArticleUrl(rawSrc, pageUrl)
    if (!url) return
    const width = intAttr(node.attr('width')) || picked?.width || null
    const height = intAttr(node.attr('height'))
    const alt = node.attr('alt')?.trim() || null
    const figure = node.closest('figure')
    const caption = figure.find('figcaption').first().text().trim() || null
    const credit =
      figure.find('[class*="credit"], [class*="copyright"], small').first().text().trim() || null
    const classOrId = `${node.attr('class') || ''} ${node.attr('id') || ''} ${figure.attr('class') || ''}`
    const inArticle = node.closest('article, [itemprop="articleBody"], main').length > 0
    const inFigure = figure.length > 0
    const inNavChrome = chromeContext($, el)
    const actualMethod = picked && picked.url === url ? 'srcset' : method
    pushCandidate(
      collected,
      seen,
      {
        sourceUrl: url,
        width,
        height,
        alt,
        caption: caption || null,
        credit: credit || null,
        mimeType: mimeFromUrl(url),
        discoveryMethod: actualMethod,
        inArticle,
        inFigure,
      },
      rejectReason({ url, width, height, alt, classOrId, inNavChrome, method: actualMethod })
    )
  }

  $('article img, main img, [itemprop="articleBody"] img').each((_i, el) => visitImg(el, 'article_dom'))
  $('figure img').each((_i, el) => visitImg(el, 'figure'))
  $('picture source[srcset]').each((_i, el) => {
    const picked = pickBestSrcsetUrl($(el).attr('srcset') || '', pageUrl)
    if (!picked) return
    const img = $(el).parent().find('img')[0]
    if (img) visitImg(img, 'srcset')
    else {
      pushCandidate(
        collected,
        seen,
        {
          sourceUrl: picked.url,
          width: picked.width,
          height: null,
          alt: null,
          caption: null,
          credit: null,
          mimeType: mimeFromUrl(picked.url),
          discoveryMethod: 'srcset',
          inArticle: $(el).closest('article, main').length > 0,
          inFigure: $(el).closest('figure').length > 0,
        },
        rejectReason({
          url: picked.url,
          width: picked.width,
          height: null,
          alt: null,
          classOrId: '',
          inNavChrome: chromeContext($, el),
          method: 'srcset',
        })
      )
    }
  })

  const largestWidth = collected.reduce<number | null>((max, c) => {
    if (c.width == null) return max
    return max == null || c.width > max ? c.width : max
  }, null)

  for (const c of collected) {
    if (
      c.status === 'ACCEPTED' &&
      largestWidth &&
      largestWidth >= 400 &&
      c.width != null &&
      c.width > 0 &&
      c.width < 80 &&
      c.discoveryMethod !== 'jsonld' &&
      c.discoveryMethod !== 'og'
    ) {
      c.status = 'REJECTED'
      c.rejectionReason = 'tiny_thumbnail'
    }
    c.score = scoreCandidate(c, pageUrl, largestWidth)
  }

  const accepted = collected
    .filter((c) => c.status === 'ACCEPTED')
    .sort((a, b) => b.score - a.score)
  const rejected = collected.filter((c) => c.status === 'REJECTED')
  const primary = accepted[0] || null
  return {
    primary,
    accepted,
    rejected,
    candidates: collected,
    imageCount: accepted.length,
  }
}

export function mediaFromStoredUrls(mainImageUrl: string | null, imageUrls: string[]): EditorialImageResult {
  const seen = new Set<string>()
  const candidates: ImageCandidate[] = []
  const urls = [mainImageUrl, ...imageUrls].filter((u): u is string => Boolean(u))
  for (const url of urls) {
    const normalized = normalizeArticleUrl(url) || url
    if (seen.has(normalized)) continue
    seen.add(normalized)
    const reject = rejectReason({
      url,
      width: null,
      height: null,
      alt: null,
      classOrId: '',
      inNavChrome: false,
      method: 'extractor',
    })
    candidates.push({
      sourceUrl: url,
      normalizedUrl: normalized,
      width: null,
      height: null,
      alt: null,
      caption: null,
      credit: null,
      mimeType: mimeFromUrl(url),
      discoveryMethod: 'extractor',
      inArticle: false,
      inFigure: false,
      score: reject ? -200 : 40,
      status: reject ? 'REJECTED' : 'ACCEPTED',
      rejectionReason: reject,
    })
  }
  const accepted = candidates.filter((c) => c.status === 'ACCEPTED')
  return {
    primary: accepted[0] || null,
    accepted,
    rejected: candidates.filter((c) => c.status === 'REJECTED'),
    candidates,
    imageCount: accepted.length,
  }
}
