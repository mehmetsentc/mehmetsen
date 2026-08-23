import * as cheerio from 'cheerio'

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
]

const CONTENT_SELECTORS = [
  'article',
  'main article',
  '[itemprop="articleBody"]',
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
  'main',
]

export function htmlToPlainText(html: string): string {
  const $ = cheerio.load(html)
  $('p, br, div, li, h1, h2, h3, h4, h5, h6, blockquote').each((_i, el) => {
    $(el).after('\n')
  })
  return $.text().replace(/\n{3,}/g, '\n\n').trim()
}

export function stripBoilerplate($: cheerio.CheerioAPI): void {
  $(REMOVE_SELECTORS.join(',')).remove()
}

export function extractSemanticArticle(html: string): {
  html: string
  text: string
  method: 'semantic' | 'density' | 'none'
} {
  const $ = cheerio.load(html)
  stripBoilerplate($)

  for (const selector of CONTENT_SELECTORS) {
    const el = $(selector).first()
    if (!el.length) continue
    const inner = el.html() || ''
    const text = htmlToPlainText(inner)
    if (text.length >= 400 || (text.split('\n').filter((p) => p.trim().length > 40).length >= 2 && text.length >= 220)) {
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

export interface DomainExtractRule {
  article?: string
  title?: string
  author?: string
  date?: string
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
}

export function extractWithDomainRule(
  html: string,
  hostname: string
): { html: string; text: string; title?: string; author?: string } | null {
  const host = hostname.replace(/^www\./, '').toLowerCase()
  const rule =
    DOMAIN_EXTRACT_RULES[hostname] ||
    DOMAIN_EXTRACT_RULES[host] ||
    DOMAIN_EXTRACT_RULES[`www.${host}`]
  if (!rule?.article) return null
  const $ = cheerio.load(html)
  stripBoilerplate($)
  const el = $(rule.article).first()
  if (!el.length) return null
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
