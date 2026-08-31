import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'

/**
 * Global structural non-story modules removed before body text extraction.
 * Prefer class/id/role signals — not generic journalistic vocabulary.
 */
const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'nav',
  'header',
  'footer',
  'form',
  'aside',
  '.ad',
  '.ads',
  '.advertisement',
  '.banner',
  '.promo',
  '.sidebar',
  '.widget',
  '.related',
  '.recommended',
  '.cookie',
  '.gdpr',
  '.consent',
  '.popup',
  '.modal',
  '.share',
  '.social',
  '.newsletter',
  '.subscription',
  '.comment',
  '.comments',
  '#comments',
  '.breadcrumb',
  '.pagination',
  // Publisher CTA / app promo (structural)
  '.evr-sub-cta',
  '.evr-sub-mobil-cta',
  '.app-download',
  '.download-app',
  '[class*="ad-"]',
  '[class*="-ad"]',
  '[id*="ad-"]',
  '[class*="banner"]',
  '[class*="sidebar"]',
  '[class*="popup"]',
  '[class*="modal"]',
  '[class*="cookie"]',
  '[class*="newsletter"]',
  '[class*="subscribe"]',
  '[class*="share"]',
  '[class*="social"]',
  '[class*="related"]',
  '[class*="recommended"]',
  '[class*="read-more"]',
  '[class*="bunlari"]',
  '[class*="son-dakika"]',
  '[class*="sondakika"]',
  '[class*="app-store"]',
  '[class*="google-play"]',
  '[class*="play-store"]',
  '[class*="sub-cta"]',
]

/**
 * Prefer semantic / CMS body roots. `[property=articleBody]` covers RDFa
 * (e.g. Evrensel); `[itemprop=articleBody]` covers microdata.
 */
const CONTENT_SELECTORS = [
  '[itemprop="articleBody"]',
  '[property="articleBody"]',
  'article [itemprop="articleBody"]',
  'article [property="articleBody"]',
  '[class*="article-body"]',
  '[class*="articleBody"]',
  '[class*="article-content"]',
  '[class*="articleContent"]',
  '[class*="news-body"]',
  '[class*="newsBody"]',
  '[class*="story-body"]',
  '[class*="post-content"]',
  '[class*="entry-content"]',
  '[class*="haber-icerik"]',
  '[class*="haberIcerik"]',
  '.news-content',
  'article',
  'main article',
  'main',
]

/** Generic stop nodes: once reached after real body, cut remaining siblings. */
export const GENERIC_STOP_SELECTORS = [
  '.evr-sub-cta',
  '.evr-sub-mobil-cta',
  '.newsletter',
  '.subscription',
  '#comments',
  '.comments',
  '.comment-list',
  '.related',
  '.recommended',
  'footer',
]

export function htmlToPlainText(html: string): string {
  const $ = cheerio.load(html)
  $('p, br, div, li, h1, h2, h3, h4, h5, h6, blockquote').each((_i, el) => {
    $(el).after('\n')
  })
  return $.text().replace(/\n{3,}/g, '\n\n').trim()
}

export function stripBoilerplate($: cheerio.CheerioAPI, extraRemove: string[] = []): void {
  const selectors = extraRemove.length ? [...REMOVE_SELECTORS, ...extraRemove] : REMOVE_SELECTORS
  $(selectors.join(',')).remove()
}

/**
 * Cut article extraction at the first strong stop module inside `$root`.
 * Removes the stop node and all following siblings up to the root boundary.
 * Does not truncate by length / paragraph count.
 */
export function trimArticleEndBoundary(
  $: cheerio.CheerioAPI,
  $root: cheerio.Cheerio<AnyNode>,
  stopSelectors: string[]
): void {
  if (!stopSelectors.length || !$root.length) return
  const stop = $root.find(stopSelectors.join(',')).first()
  if (!stop.length) return

  const rootEl = $root.get(0) ?? null
  let node: AnyNode | null = stop.get(0) ?? null
  let removeNode = true

  while (node && node !== rootEl) {
    let sibling = node.nextSibling
    while (sibling) {
      const next = sibling.nextSibling
      $(sibling).remove()
      sibling = next
    }
    const parent = node.parentNode as AnyNode | null
    if (removeNode) {
      $(node).remove()
      removeNode = false
    }
    node = parent
  }
}

export interface DomainExtractRule {
  article?: string
  title?: string
  author?: string
  date?: string
  /** Extra DOM nodes to remove inside the article root (and globally before select). */
  removeSelectors?: string[]
  /** First matching node ends the article; node + following siblings are dropped. */
  stopSelectors?: string[]
  /** Publisher-specific plain-text stop markers (only after a sufficient body). */
  textStopMarkers?: string[]
}

export const DOMAIN_EXTRACT_RULES: Record<string, DomainExtractRule> = {
  // Habertürk: Tailwind CMS — gövde çoğunlukla JSON-LD; DOM yedekleri
  'haberturk.com': {
    article: '.cms-container, .news-wrapper, article',
    title: 'h1',
  },
  'www.haberturk.com': {
    article: '.cms-container, .news-wrapper, article',
    title: 'h1',
  },
  /**
   * Evrensel: real body is `[property=articleBody] > .news-content`.
   * Subscription (`.evr-sub-cta`) and app promo (`.evr-sub-mobil-cta`) are
   * nested INSIDE that same root after the last real paragraph.
   */
  'evrensel.net': {
    article:
      '.news-article [property="articleBody"] .news-content, .news-article [property="articleBody"], [property="articleBody"] .news-content, [property="articleBody"]',
    title: 'h1.articleTitle, h1',
    removeSelectors: [
      '.evr-sub-cta',
      '.evr-sub-mobil-cta',
      '.aboneol',
      '.aboneTakip',
      '.abone-item',
      '.paylas',
    ],
    stopSelectors: ['.evr-sub-cta', '.evr-sub-mobil-cta'],
    textStopMarkers: [
      "Evrensel'e Abone Ol",
      'Evrensel’e Abone Ol',
      'Dijital Evrensel uygulamamız güncellendi',
      "Evrensel'i, Google'da tercih edilen kaynak olarak ekleyin",
      'Evrensel’i, Google’da tercih edilen kaynak olarak ekleyin',
    ],
  },
  'www.evrensel.net': {
    article:
      '.news-article [property="articleBody"] .news-content, .news-article [property="articleBody"], [property="articleBody"] .news-content, [property="articleBody"]',
    title: 'h1.articleTitle, h1',
    removeSelectors: [
      '.evr-sub-cta',
      '.evr-sub-mobil-cta',
      '.aboneol',
      '.aboneTakip',
      '.abone-item',
      '.paylas',
    ],
    stopSelectors: ['.evr-sub-cta', '.evr-sub-mobil-cta'],
    textStopMarkers: [
      "Evrensel'e Abone Ol",
      'Evrensel’e Abone Ol',
      'Dijital Evrensel uygulamamız güncellendi',
      "Evrensel'i, Google'da tercih edilen kaynak olarak ekleyin",
      'Evrensel’i, Google’da tercih edilen kaynak olarak ekleyin',
    ],
  },
}

export function resolveDomainRule(hostname: string): DomainExtractRule | null {
  const host = hostname.replace(/^www\./, '').toLowerCase()
  return (
    DOMAIN_EXTRACT_RULES[hostname] ||
    DOMAIN_EXTRACT_RULES[host] ||
    DOMAIN_EXTRACT_RULES[`www.${host}`] ||
    null
  )
}

function prepareArticleRoot(
  $: cheerio.CheerioAPI,
  $root: cheerio.Cheerio<AnyNode>,
  rule: DomainExtractRule | null
): void {
  const extraRemove = rule?.removeSelectors ?? []
  if (extraRemove.length) {
    $root.find(extraRemove.join(',')).remove()
  }
  const stops = [...GENERIC_STOP_SELECTORS, ...(rule?.stopSelectors ?? [])]
  // Re-query stops that may remain if not in remove list (ordering)
  trimArticleEndBoundary($, $root, stops)
}

/**
 * Publisher-specific textual fallback. Only cuts when a marker appears as its
 * own line/block AFTER a sufficient legitimate body. Never global generic words.
 */
export function trimBodyTextAtPublisherStops(
  text: string,
  hostname: string | null | undefined,
  minBodyChars = 220
): string {
  if (!hostname || !text.trim()) return text
  const rule = resolveDomainRule(hostname)
  const markers = rule?.textStopMarkers
  if (!markers?.length) return text

  const normalized = text.replace(/\r\n/g, '\n')
  let cutAt = -1
  for (const marker of markers) {
    const idx = normalized.indexOf(marker)
    if (idx < 0) continue
    if (idx < minBodyChars) continue
    // Prefer markers that start a line / block
    const before = normalized[idx - 1]
    if (idx > 0 && before && !/[\n\r]/.test(before) && !/\s/.test(before)) continue
    if (cutAt < 0 || idx < cutAt) cutAt = idx
  }
  if (cutAt < 0) return text
  return normalized.slice(0, cutAt).replace(/\s+$/g, '').trim()
}

/** Drop obvious leading title/spot echo — not fuzzy semantic dedup. */
export function stripLeadingTitleEcho(text: string, title: string | null | undefined): string {
  if (!title?.trim() || !text.trim()) return text
  const t = title.trim()
  if (t.length < 12) return text
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return text
  if (lines[0].toLowerCase() === t.toLowerCase()) {
    return lines.slice(1).join('\n\n').trim()
  }
  // First paragraph equals title
  const firstPara = text.split(/\n{2,}/)[0]?.trim() || ''
  if (firstPara.toLowerCase() === t.toLowerCase()) {
    return text.slice(firstPara.length).replace(/^\s+/, '').trim()
  }
  return text
}

/**
 * Finalize body HTML/text for a host: removeSelectors, end-boundary, text stops.
 * Safe to call for every extraction method (jsonld / domain / semantic / generic).
 */
export function finalizeExtractedBody(
  bodyHtml: string,
  bodyText: string,
  hostname: string | null | undefined,
  title?: string | null
): { html: string; text: string } {
  const rule = hostname ? resolveDomainRule(hostname) : null
  let html = bodyHtml || ''
  let text = bodyText || ''

  if (html && /<[a-z][\s\S]*>/i.test(html)) {
    const $ = cheerio.load(`<div id="__nh_article_root">${html}</div>`)
    const $root = $('#__nh_article_root')
    prepareArticleRoot($, $root, rule)
    html = $root.html() || ''
    text = htmlToPlainText(html)
  }

  text = trimBodyTextAtPublisherStops(text, hostname)
  text = stripLeadingTitleEcho(text, title)

  // Keep HTML roughly aligned when text was cut by markers
  if (html && text && htmlToPlainText(html).length > text.length + 40) {
    html = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        // Preserve short heading-like lines as h3 when they lack sentence punctuation
        if (p.length <= 90 && !/[.!?…]$/.test(p) && !p.includes('\n')) {
          return `<h3>${escapeHtml(p)}</h3>`
        }
        return `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`
      })
      .join('')
  }

  return { html, text }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function extractSemanticArticle(html: string, hostname?: string | null): {
  html: string
  text: string
  method: 'semantic' | 'density' | 'none'
} {
  const $ = cheerio.load(html)
  const rule = hostname ? resolveDomainRule(hostname) : null
  stripBoilerplate($, rule?.removeSelectors)

  for (const selector of CONTENT_SELECTORS) {
    const el = $(selector).first()
    if (!el.length) continue
    // Skip related-preview articleBodies (Evrensel: .preview-content)
    if (el.closest('.preview-content, .related, .recommended, aside').length) continue
    prepareArticleRoot($, el, rule)
    const inner = el.html() || ''
    const text = htmlToPlainText(inner)
    if (
      text.length >= 400 ||
      (text.split('\n').filter((p) => p.trim().length > 40).length >= 2 && text.length >= 220)
    ) {
      return { html: inner, text, method: 'semantic' }
    }
  }

  const scored = densityExtract($)
  if (scored.text.length >= 220) return scored
  return { html: '', text: '', method: 'none' }
}

function densityExtract($: cheerio.CheerioAPI): {
  html: string
  text: string
  method: 'density'
} {
  let bestHtml = ''
  let bestText = ''
  let bestScore = 0
  $('p').parent().each((_i, parent) => {
    const $parent = $(parent)
    if ($parent.closest('.evr-sub-cta, .evr-sub-mobil-cta, .preview-content, aside, nav, footer').length) {
      return
    }
    const paragraphs = $parent
      .find('p')
      .toArray()
      .map((p) => $(p).text().trim())
      .filter((t) => t.length > 40)
    const text = paragraphs.join('\n\n')
    const links = $parent.find('a').length
    const score = text.length - links * 40
    if (score > bestScore && text.length > bestText.length) {
      bestScore = score
      bestText = text
      bestHtml = $parent.html() || ''
    }
  })
  return { html: bestHtml, text: bestText, method: 'density' }
}

export function extractWithDomainRule(
  html: string,
  hostname: string
): { html: string; text: string; title?: string; author?: string } | null {
  const rule = resolveDomainRule(hostname)
  if (!rule?.article) return null
  const $ = cheerio.load(html)
  stripBoilerplate($, rule.removeSelectors)
  const el = $(rule.article).first()
  if (!el.length) return null
  prepareArticleRoot($, el, rule)
  const inner = el.html() || ''
  const text = htmlToPlainText(inner)
  if (text.length < 120) return null
  return {
    html: inner,
    text,
    title: rule.title ? $(rule.title).first().text().trim() : undefined,
    author: rule.author ? $(rule.author).first().text().trim() : undefined,
  }
}
