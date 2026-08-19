import * as cheerio from 'cheerio'
import type { Element } from 'domhandler'
import { extractJsonLdArticle } from './jsonld'
import { extractOpenGraph } from './opengraph'
import {
  GALLERY_FIGURE_THRESHOLD,
  MAX_BANNER_ASPECT,
  MAX_DEFAULT_EXTRAS,
  MAX_EDITORIAL_IMAGES_PER_ARTICLE,
  MAX_GALLERY_EXTRAS,
  MIN_GALLERY_HEIGHT,
  MIN_GALLERY_WIDTH,
  cdnQualityRank,
  imageVariantKey,
  normalizeImageUrl,
  urlContentHash,
} from './imageNormalize'
import {
  adapterForHost,
  extraImageAllowed,
  imageConfidenceFor,
  imageSourceFromMethod,
  type ImageSource,
  type SourceImageAdapter,
} from './imageProvenance'

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
  imageSource: ImageSource
  imageConfidence: number
  inArticle: boolean
  inFigure: boolean
  score: number
  qualityScore: number
  contentHash: string | null
  perceptualHash: string | null
  status: 'ACCEPTED' | 'REJECTED'
  rejectionReason: string | null
}

export interface EditorialImageResult {
  primary: ImageCandidate | null
  accepted: ImageCandidate[]
  rejected: ImageCandidate[]
  candidates: ImageCandidate[]
  imageCount: number
  duplicateCount: number
  adRejected: number
  logoRejected: number
  tinyRejected: number
}

const ACCEPT_ANCESTOR =
  'article, main, [itemprop="articleBody"], .content-body, .article-body, .entry-content, .post-content, .news-content, .story-body, .haber-icerik, .article-container, [itemprop="article"]'

const REJECT_ANCESTOR =
  'header, footer, nav, aside, [role="banner"], [role="navigation"], [role="complementary"], [role="ads"], .ad, .ads, .advert, .advertisement, .ad-slot, .ad-container, .banner, .promo, .promotion, .sponsor, .sponsored, .related, .related-news, .related-stories, .recommended, .popular, .most-read, .mostread, .sidebar, .widget, .newsletter, .paywall, .popup, .modal, .author, .byline, .avatar, .logo, .evrensel-manset, .manset-main, .manset-tip1, [class*="reklam"], [id*="reklam"], [class*="kampanya"], [id*="kampanya"], [class*="tanitim"], [class*="abonelik"], [class*="bulten"], [class*="newsletter"], [class*="sidebar"], [class*="related"], [class*="recommend"], [class*="popular"], [class*="most-read"], [class*="mostread"], [class*="son-dakika"], [class*="diger-haber"], [class*="evrensel-manset"], [class*="manset-main"], [class*="carousel"]:not(article *), [class*="swiper"]:not(article *), [class*="slider"]:not(article *)'

const AD_NETWORK =
  /doubleclick|googlesyndication|googleadservices|pagead|adservice|adnxs|adform|taboola|outbrain|criteo|mgid|revcontent|adsystem|adsrvr|advertising\.com|promo-banner|kampanya-banner/i

const STRONG_AD_PATH = /\/(?:ads?|advert|reklam|kampanya|promo|sponsor|affiliates?)\b/i

const LOGO_PATH = /(?:^|[/_-])logo(?:[._-]|$)|favicon|apple-touch|mstile/i

const UI_CHROME_ASSET =
  /preferred-source|haberarasi|(?:^|[/_-])badge(?:[._/-]|$)|google-g\.png|google-preferred-source/i

const AVATAR_PATH = /(?:avatar|profile.?photo|author.?img)(?:[._/-]|$)/i

const PIXEL_PATH = /(?:pixel|1x1|spacer|tracking)(?:[._/-]|$)|blank\.gif/i

const TR_PROMO =
  /\b(reklam|kampanya|tanitim|tanıtım|abonelik|abone|bulten|bülten|uyelik|üyelik)\b/i

const PRODUCT_AD =
  /\b(shop-now|buy-now|add-to-cart|product-ad|sponsored-product|amazon-ads|affiliate)\b/i

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

/** Habertürk-style related thumbs encode size in the path (`/200x200`) with no width attr. */
export function dimensionsFromImageUrl(url: string): { width: number | null; height: number | null } {
  try {
    const parsed = new URL(url)
    const pathMatch = parsed.pathname.match(/(?:^|\/)(\d{2,4})x(\d{2,4})(?:\/|$)/i)
    if (pathMatch) {
      return { width: Number(pathMatch[1]), height: Number(pathMatch[2]) }
    }
    return {
      width: intAttr(parsed.searchParams.get('width') || parsed.searchParams.get('w') || undefined),
      height: intAttr(parsed.searchParams.get('height') || parsed.searchParams.get('h') || undefined),
    }
  } catch {
    return { width: null, height: null }
  }
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
    const url = normalizeImageUrl(raw, pageUrl)
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

function aspectRatio(width: number | null, height: number | null): number | null {
  if (!width || !height || height <= 0) return null
  return width / height
}

export function classifyImageRejection(input: {
  url: string
  width: number | null
  height: number | null
  alt: string | null
  title?: string | null
  classOrId: string
  inRejectChrome: boolean
  inAcceptBody: boolean
  method: ImageDiscoveryMethod
}): string | null {
  const url = input.url.toLowerCase()
  const text = `${input.alt || ''} ${input.title || ''} ${input.classOrId}`
  const signals: string[] = []

  if (url.startsWith('data:')) return 'data_uri'
  if (url.startsWith('blob:')) return 'blob_uri'
  if (UI_CHROME_ASSET.test(url) || UI_CHROME_ASSET.test(text)) return 'logo_or_favicon'
  if (input.width === 1 && input.height === 1) return 'tracking_pixel'
  if (input.width != null && input.height != null && input.width <= 2 && input.height <= 2) {
    return 'tracking_pixel'
  }
  if (PIXEL_PATH.test(url)) return 'tracking_pixel'

  if (AD_NETWORK.test(url) || STRONG_AD_PATH.test(url)) signals.push('ad_url')
  if (PRODUCT_AD.test(url) || PRODUCT_AD.test(text)) signals.push('product_ad')
  if (/\b(ad-?banner|advert|adsense|sponsor|sponsored|promo-banner)\b/i.test(text)) signals.push('ad_attr')
  if (TR_PROMO.test(text) || TR_PROMO.test(url)) signals.push('tr_promo')
  if (input.inRejectChrome && !input.inAcceptBody) signals.push('chrome')
  if (input.inRejectChrome && input.inAcceptBody) signals.push('nested_chrome')

  const aspect = aspectRatio(input.width, input.height)
  if (aspect != null && aspect > MAX_BANNER_ASPECT) signals.push('wide_banner')
  if (aspect != null && aspect > 6) return 'ad_or_banner'

  if (
    input.width != null &&
    input.height != null &&
    (input.width < MIN_GALLERY_WIDTH || input.height < MIN_GALLERY_HEIGHT)
  ) {
    signals.push('tiny')
  }

  const logoFile = LOGO_PATH.test(url) || /\blogo\b/i.test(text)
  const logoSmall =
    input.width != null &&
    input.height != null &&
    input.width <= 180 &&
    input.height <= 180
  if (logoFile && (logoSmall || input.inRejectChrome || /\blogo\b/i.test(input.classOrId))) {
    return 'logo_or_favicon'
  }
  if (AVATAR_PATH.test(url) || /\b(avatar|author|byline)\b/i.test(input.classOrId)) return 'avatar'
  if (mimeFromUrl(input.url) === 'image/svg+xml' && (logoFile || /\b(logo|icon|sprite)\b/i.test(text) || logoSmall)) {
    return 'logo_or_favicon'
  }

  const adScore = signals.filter((s) => s === 'ad_url' || s === 'ad_attr' || s === 'product_ad' || s === 'tr_promo').length
  const bannerScore = signals.filter((s) => s === 'wide_banner' || s === 'chrome' || s === 'nested_chrome').length
  if (adScore >= 2 || (adScore >= 1 && bannerScore >= 1) || signals.includes('ad_url')) {
    if (signals.includes('product_ad')) return 'product_ad'
    return 'ad_or_banner'
  }
  if (signals.includes('wide_banner') && (signals.includes('tiny') || signals.includes('chrome'))) {
    return 'ad_or_banner'
  }
  if (
    signals.includes('tiny') &&
    input.method !== 'jsonld' &&
    input.method !== 'jsonld_object' &&
    input.method !== 'og' &&
    input.method !== 'twitter'
  ) {
    return 'tiny_thumbnail'
  }
  const metaMethod =
    input.method === 'jsonld' ||
    input.method === 'jsonld_object' ||
    input.method === 'og' ||
    input.method === 'twitter'
  if (input.inRejectChrome && !metaMethod) {
    return 'unrelated_chrome'
  }
  return null
}

function scoreCandidate(c: ImageCandidate, articleUrl: string, largestWidth: number | null): number {
  let score = 0
  if (c.discoveryMethod === 'jsonld' || c.discoveryMethod === 'jsonld_object') score += 100
  else if (c.discoveryMethod === 'og') score += 80
  else if (c.discoveryMethod === 'twitter') score += 70
  else if (c.inFigure) score += 62
  else if (c.discoveryMethod === 'article_dom') score += 60
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
  seenVariants: Map<string, ImageCandidate>,
  stats: { duplicates: number },
  partial: Omit<
    ImageCandidate,
    | 'score'
    | 'status'
    | 'rejectionReason'
    | 'normalizedUrl'
    | 'qualityScore'
    | 'contentHash'
    | 'perceptualHash'
    | 'imageSource'
    | 'imageConfidence'
  > & { normalizedUrl?: string | null; imageSource?: ImageSource; imageConfidence?: number },
  reject: string | null
): void {
  const exact = normalizeImageUrl(partial.sourceUrl) || partial.normalizedUrl
  if (!exact) return
  const variantKey = imageVariantKey(exact)
  const existing = seenVariants.get(variantKey)
  const imageSource = partial.imageSource || imageSourceFromMethod(partial.discoveryMethod)
  if (existing) {
    stats.duplicates += 1
    const newRank = cdnQualityRank(partial.sourceUrl, partial.width, partial.height)
    const oldRank = cdnQualityRank(existing.sourceUrl, existing.width, existing.height)
    if (newRank > oldRank) {
      existing.sourceUrl = partial.sourceUrl
      existing.width = partial.width ?? existing.width
      existing.height = partial.height ?? existing.height
      existing.alt = existing.alt || partial.alt
      existing.caption = existing.caption || partial.caption
      existing.credit = existing.credit || partial.credit
      existing.inArticle = existing.inArticle || partial.inArticle
      existing.inFigure = existing.inFigure || partial.inFigure
      existing.imageSource = existing.imageSource || imageSource
    }
    if (!existing.rejectionReason && reject) {
      existing.status = 'REJECTED'
      existing.rejectionReason = reject
      existing.imageConfidence = 0
    }
    return
  }
  const row: ImageCandidate = {
    ...partial,
    sourceUrl: partial.sourceUrl,
    normalizedUrl: variantKey,
    imageSource,
    imageConfidence: 0,
    score: 0,
    qualityScore: 0,
    contentHash: urlContentHash(variantKey),
    perceptualHash: null,
    status: reject ? 'REJECTED' : 'ACCEPTED',
    rejectionReason: reject,
  }
  row.imageConfidence = imageConfidenceFor({
    source: row.imageSource,
    inArticle: row.inArticle,
    inFigure: row.inFigure,
    rejected: row.status === 'REJECTED',
    width: row.width,
    height: row.height,
  })
  seenVariants.set(variantKey, row)
  list.push(row)
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
    const url = normalizeImageUrl(String(rec.contentUrl || rec.url || rec['@id'] || ''), pageUrl)
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
        const url = normalizeImageUrl(img, pageUrl)
        if (url) acc.push({ url, method: 'jsonld', width: null, height: null, caption: null, credit: null })
      } else {
        walkImages(img, pageUrl, acc)
        if (img && typeof img === 'object') {
          const recImg = img as Record<string, unknown>
          const url = normalizeImageUrl(String(recImg.contentUrl || recImg.url || ''), pageUrl)
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

function ancestryFlags(
  $: cheerio.CheerioAPI,
  el: Element,
  extraReject?: string | null,
  extraAccept?: string | null
): { inRejectChrome: boolean; inAcceptBody: boolean } {
  const node = $(el)
  const rejectSel = extraReject ? `${REJECT_ANCESTOR}, ${extraReject}` : REJECT_ANCESTOR
  const acceptSel = extraAccept ? `${ACCEPT_ANCESTOR}, ${extraAccept}` : ACCEPT_ANCESTOR
  const rejectHit = node.closest(rejectSel)
  const acceptHit = node.closest(acceptSel)
  const inAcceptBody = acceptHit.length > 0
  if (!rejectHit.length) return { inRejectChrome: false, inAcceptBody }
  if (!inAcceptBody) return { inRejectChrome: true, inAcceptBody: false }
  const rejectParents = rejectHit.toArray()
  const acceptEl = acceptHit.get(0)
  const rejectCloser = rejectParents.some((r) => acceptEl && $.contains(acceptEl, r))
  return { inRejectChrome: rejectCloser, inAcceptBody }
}

function finalize(collected: ImageCandidate[], pageUrl: string, duplicateCount: number): EditorialImageResult {
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
    c.qualityScore = Math.max(0, c.score)
    c.imageSource = c.imageSource || imageSourceFromMethod(c.discoveryMethod)
    c.imageConfidence = imageConfidenceFor({
      source: c.imageSource,
      inArticle: c.inArticle,
      inFigure: c.inFigure,
      rejected: c.status === 'REJECTED',
      width: c.width,
      height: c.height,
    })
  }

  const acceptedAll = collected
    .filter((c) => c.status === 'ACCEPTED')
    .sort((a, b) => b.score - a.score)
  const figureCount = acceptedAll.filter((c) => c.inFigure && extraImageAllowed(c.imageSource, c.inArticle)).length
  const extrasCap = figureCount >= GALLERY_FIGURE_THRESHOLD ? MAX_GALLERY_EXTRAS : MAX_DEFAULT_EXTRAS
  const maxTotal = Math.max(MAX_EDITORIAL_IMAGES_PER_ARTICLE, 1 + extrasCap)
  const keep: ImageCandidate[] = []
  for (const c of acceptedAll) {
    if (!keep.length) {
      keep.push(c)
      continue
    }
    if (!extraImageAllowed(c.imageSource, c.inArticle)) {
      c.status = 'REJECTED'
      c.rejectionReason = c.rejectionReason || 'not_article_body'
      c.score = scoreCandidate(c, pageUrl, largestWidth)
      c.qualityScore = Math.max(0, c.score)
      c.imageConfidence = 0
      continue
    }
    if (keep.length >= maxTotal) {
      c.status = 'REJECTED'
      c.rejectionReason = c.rejectionReason || 'over_max_editorial'
      c.score = scoreCandidate(c, pageUrl, largestWidth)
      c.qualityScore = Math.max(0, c.score)
      continue
    }
    keep.push(c)
  }
  const accepted = keep
  const rejected = collected.filter((c) => c.status === 'REJECTED')
  const primary = accepted.find((c) => c.status === 'ACCEPTED') || null
  return {
    primary,
    accepted,
    rejected,
    candidates: collected,
    imageCount: accepted.length,
    duplicateCount,
    adRejected: rejected.filter((c) => c.rejectionReason === 'ad_or_banner' || c.rejectionReason === 'product_ad').length,
    logoRejected: rejected.filter((c) => c.rejectionReason === 'logo_or_favicon').length,
    tinyRejected: rejected.filter((c) => c.rejectionReason === 'tiny_thumbnail' || c.rejectionReason === 'tracking_pixel').length,
  }
}

export function extractEditorialImages(
  html: string,
  pageUrl: string,
  opts?: { adapter?: SourceImageAdapter | null }
): EditorialImageResult {
  const $ = cheerio.load(html)
  const seenVariants = new Map<string, ImageCandidate>()
  const collected: ImageCandidate[] = []
  const stats = { duplicates: 0 }
  const og = extractOpenGraph(html, pageUrl)
  const adapter = opts?.adapter === undefined ? adapterForHost(pageUrl) : opts.adapter

  for (const img of collectJsonLdImages(html, pageUrl)) {
    const reject = classifyImageRejection({
      url: img.url,
      width: img.width,
      height: img.height,
      alt: img.caption,
      classOrId: '',
      inRejectChrome: false,
      inAcceptBody: true,
      method: img.method,
    })
    pushCandidate(
      collected,
      seenVariants,
      stats,
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

  const ogUrl = og.image ? normalizeImageUrl(og.image, pageUrl) : null
  if (ogUrl) {
    const ogWidth = intAttr($('meta[property="og:image:width"]').attr('content'))
    const ogHeight = intAttr($('meta[property="og:image:height"]').attr('content'))
    pushCandidate(
      collected,
      seenVariants,
      stats,
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
      classifyImageRejection({
        url: ogUrl,
        width: ogWidth,
        height: ogHeight,
        alt: null,
        classOrId: '',
        inRejectChrome: false,
        inAcceptBody: true,
        method: 'og',
      })
    )
  }

  const tw =
    $('meta[name="twitter:image"]').attr('content')?.trim() ||
    $('meta[property="twitter:image"]').attr('content')?.trim() ||
    null
  const twUrl = tw ? normalizeImageUrl(tw, pageUrl) : null
  if (twUrl) {
    pushCandidate(
      collected,
      seenVariants,
      stats,
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
      classifyImageRejection({
        url: twUrl,
        width: null,
        height: null,
        alt: null,
        classOrId: '',
        inRejectChrome: false,
        inAcceptBody: true,
        method: 'twitter',
      })
    )
  }

  const visitImg = (el: Element, method: ImageDiscoveryMethod) => {
    const node = $(el)
    const srcset =
      node.attr('srcset') ||
      node.attr('data-srcset') ||
      node.parent('picture').find('source').attr('srcset') ||
      node.parent('picture').find('source').attr('data-srcset')
    const picked = srcset ? pickBestSrcsetUrl(srcset, pageUrl) : null
    const rawSrc =
      picked?.url ||
      node.attr('src') ||
      node.attr('data-src') ||
      node.attr('data-original') ||
      node.attr('data-lazy-src') ||
      node.attr('data-lazy') ||
      node.attr('data-bg')
    if (!rawSrc) return
    const url = normalizeImageUrl(rawSrc, pageUrl)
    if (!url) return
    const urlDims = dimensionsFromImageUrl(url)
    const attrWidth = intAttr(node.attr('width')) || picked?.width || null
    const attrHeight = intAttr(node.attr('height'))
    const pathThumb =
      urlDims.width != null &&
      urlDims.height != null &&
      (urlDims.width < MIN_GALLERY_WIDTH || urlDims.height < MIN_GALLERY_HEIGHT)
    const width = pathThumb ? urlDims.width : attrWidth || urlDims.width
    const height = pathThumb ? urlDims.height : attrHeight || urlDims.height
    const alt = node.attr('alt')?.trim() || null
    const title = node.attr('title')?.trim() || null
    const figure = node.closest('figure')
    const caption = figure.find('figcaption').first().text().trim() || null
    const credit =
      figure.find('[class*="credit"], [class*="copyright"], small').first().text().trim() || null
    const classOrId = `${node.attr('class') || ''} ${node.attr('id') || ''} ${figure.attr('class') || ''} ${node.parents().slice(0, 6).map((_, p) => `${$(p).attr('class') || ''} ${$(p).attr('id') || ''}`).get().join(' ')}`
    const { inRejectChrome, inAcceptBody } = ancestryFlags(
      $,
      el,
      adapter?.extraRejectSelector,
      adapter?.extraAcceptSelector
    )
    const inArticle = inAcceptBody
    const inFigure = figure.length > 0
    const actualMethod = picked && picked.url === url ? 'srcset' : inFigure ? 'figure' : method
    pushCandidate(
      collected,
      seenVariants,
      stats,
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
      classifyImageRejection({
        url,
        width,
        height,
        alt,
        title,
        classOrId,
        inRejectChrome,
        inAcceptBody,
        method: actualMethod,
      })
    )
  }

  const bodyScope = adapter?.extraAcceptSelector
    ? `${ACCEPT_ANCESTOR}, ${adapter.extraAcceptSelector}`
    : ACCEPT_ANCESTOR
  $(bodyScope)
    .find('img')
    .each((_i, el) => visitImg(el, 'article_dom'))
  $(bodyScope)
    .find('picture source[srcset], picture source[data-srcset]')
    .each((_i, el) => {
    const picked = pickBestSrcsetUrl($(el).attr('srcset') || $(el).attr('data-srcset') || '', pageUrl)
    if (!picked) return
    const img = $(el).parent().find('img')[0]
    if (img) visitImg(img, 'srcset')
    else {
      const { inRejectChrome, inAcceptBody } = ancestryFlags(
        $,
        el,
        adapter?.extraRejectSelector,
        adapter?.extraAcceptSelector
      )
      const urlDims = dimensionsFromImageUrl(picked.url)
      pushCandidate(
        collected,
        seenVariants,
        stats,
        {
          sourceUrl: picked.url,
          width: picked.width || urlDims.width,
          height: urlDims.height,
          alt: null,
          caption: null,
          credit: null,
          mimeType: mimeFromUrl(picked.url),
          discoveryMethod: 'srcset',
          inArticle: inAcceptBody,
          inFigure: $(el).closest('figure').length > 0,
        },
        classifyImageRejection({
          url: picked.url,
          width: picked.width || urlDims.width,
          height: urlDims.height,
          alt: null,
          classOrId: '',
          inRejectChrome,
          inAcceptBody,
          method: 'srcset',
        })
      )
    }
  })

  return finalize(collected, pageUrl, stats.duplicates)
}

export function mediaFromStoredUrls(mainImageUrl: string | null, imageUrls: string[]): EditorialImageResult {
  const seenVariants = new Map<string, ImageCandidate>()
  const candidates: ImageCandidate[] = []
  const stats = { duplicates: 0 }
  const urls = [mainImageUrl, ...imageUrls].filter((u): u is string => Boolean(u))
  for (const url of urls) {
    const normalized = normalizeImageUrl(url) || url
    const reject = classifyImageRejection({
      url,
      width: null,
      height: null,
      alt: null,
      classOrId: '',
      inRejectChrome: false,
      inAcceptBody: true,
      method: 'extractor',
    })
    pushCandidate(
      candidates,
      seenVariants,
      stats,
      {
        sourceUrl: url,
        width: null,
        height: null,
        alt: null,
        caption: null,
        credit: null,
        mimeType: mimeFromUrl(url),
        discoveryMethod: 'extractor',
        inArticle: false,
        inFigure: false,
      },
      reject
    )
    void normalized
  }
  return finalize(candidates, urls[0] || 'https://nahaber.com/', stats.duplicates)
}

export function selectEditorialHandoff(result: EditorialImageResult): {
  primaryUrl: string | null
  extraUrls: string[]
} {
  const accepted = result.accepted.filter((c) => c.status === 'ACCEPTED')
  const primary = result.primary && result.primary.status === 'ACCEPTED' ? result.primary : accepted[0] || null
  const figureCount = accepted.filter((c) => c.inFigure && extraImageAllowed(c.imageSource, c.inArticle)).length
  const extrasCap = figureCount >= GALLERY_FIGURE_THRESHOLD ? MAX_GALLERY_EXTRAS : MAX_DEFAULT_EXTRAS
  const extras = accepted
    .filter((c) => !primary || c.normalizedUrl !== primary.normalizedUrl)
    .filter((c) => extraImageAllowed(c.imageSource, c.inArticle))
    .slice(0, extrasCap)
    .map((c) => c.sourceUrl)
  return { primaryUrl: primary?.sourceUrl ?? null, extraUrls: extras }
}
