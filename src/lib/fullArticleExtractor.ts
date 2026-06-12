/**
 * Full Article Extractor
 * Uses @extractus/article-extractor (primary) with cheerio fallback.
 * Extracts: title, content, author, publishedAt, featuredImage, readingTime.
 */
import * as cheerio from 'cheerio'

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Referer: 'https://www.google.com/',
}

const MAX_BYTES = 400_000 // 400 KB
const FETCH_TIMEOUT_MS = 10_000

export interface ExtractedArticle {
  title: string | null
  content: string          // cleaned plain text, may be empty
  htmlContent: string      // cleaned HTML for rich rendering
  summary: string | null
  author: string | null
  publishedAt: Date | null
  featuredImage: string | null
  readingTimeMinutes: number
  source: string | null
  extractionMethod: 'article-extractor' | 'cheerio' | 'meta-only' | 'failed' | 'jina'
}

// ── Noise selectors to remove before extracting ──────────────────────────
const REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe',
  'nav', 'header', 'footer',
  '.ad', '.ads', '.advertisement', '.banner', '.promo',
  '.sidebar', '.widget', '.related', '.recommended',
  '.cookie', '.gdpr', '.consent', '.popup', '.modal',
  '.share', '.social', '.newsletter', '.subscription',
  '[class*="ad-"]', '[class*="-ad"]', '[id*="ad-"]',
  '[class*="banner"]', '[class*="sidebar"]',
  '[class*="popup"]', '[class*="modal"]', '[class*="overlay"]',
  '[class*="cookie"]', '[class*="gdpr"]',
  '[class*="newsletter"]', '[class*="subscribe"]',
  '.comment', '.comments', '#comments',
  '.breadcrumb', '.pagination',
]

// ── Content selectors to try in priority order ────────────────────────────
const CONTENT_SELECTORS = [
  'article',
  '[class*="article-body"]', '[class*="articleBody"]',
  '[class*="article-content"]', '[class*="articleContent"]',
  '[class*="news-body"]', '[class*="newsBody"]',
  '[class*="haber-detay"]', '[class*="haberDetay"]',
  '[class*="haber-icerik"]', '[class*="haberIcerik"]',
  '[class*="haber-metin"]', '[class*="haberMetin"]',
  '[class*="news-content"]', '[class*="newsContent"]',
  '[class*="story-body"]', '[class*="storyBody"]',
  '[class*="post-content"]', '[class*="postContent"]',
  '[class*="entry-content"]', '[class*="entryContent"]',
  '[class*="article-text"]', '[class*="articleText"]',
  '[class*="content-body"]', '[class*="contentBody"]',
  'main [class*="content"]',
  '.content', '#content', 'main',
]

function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

function htmlToPlainText(html: string): string {
  const $ = cheerio.load(html)
  // Replace block elements with newlines
  $('p, br, div, li, h1, h2, h3, h4, h5, h6').each((_i, el) => {
    $(el).after('\n')
  })
  return $.text().replace(/\n{3,}/g, '\n\n').trim()
}

function cleanHtml(html: string): string {
  const $ = cheerio.load(html)
  // Remove noise inside content
  $('script, style, noscript, iframe, [class*="ad"], [class*="share"], [class*="social"], [class*="related"]').remove()
  // Remove empty elements
  $('*').each((_i, el) => {
    const $el = $(el)
    if ($el.children().length === 0 && !$el.text().trim()) $el.remove()
  })
  return $.html() || ''
}

/** Extract meta tags from HTML */
function extractMeta($: cheerio.CheerioAPI) {
  const get = (selectors: string[]): string | null => {
    for (const s of selectors) {
      const val = $(s).attr('content')?.trim()
      if (val && val.length > 3) return val
    }
    return null
  }

  const title =
    get(['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
    $('title').first().text().trim() || null

  const description = get([
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ])

  const image = get([
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="og:image:secure_url"]',
  ])

  const author = get([
    'meta[name="author"]',
    'meta[property="article:author"]',
    'meta[name="dc.creator"]',
  ]) || $('[rel="author"]').first().text().trim() || null

  const publishedStr = get([
    'meta[property="article:published_time"]',
    'meta[name="publishdate"]',
    'meta[itemprop="datePublished"]',
  ]) || $('time[datetime]').first().attr('datetime') || null

  const publishedAt = publishedStr ? new Date(publishedStr) : null

  const source = get(['meta[property="og:site_name"]']) ||
    $('link[rel="canonical"]').attr('href') || null

  return { title, description, image, author, publishedAt, source }
}

/** Cheerio-based content extraction */
function extractWithCheerio(html: string, url: string): ExtractedArticle {
  const $ = cheerio.load(html)

  // Remove noise globally
  $(REMOVE_SELECTORS.join(',')).remove()

  const meta = extractMeta($)

  // Try content selectors in order
  let contentHtml = ''
  let contentText = ''

  for (const selector of CONTENT_SELECTORS) {
    const el = $(selector).first()
    if (el.length) {
      const text = el.text().trim()
      if (text.length > 200) {
        contentHtml = cleanHtml(el.html() || '')
        contentText = htmlToPlainText(contentHtml)
        break
      }
    }
  }

  // Fallback: collect all paragraphs
  if (contentText.length < 150) {
    const paras: string[] = []
    $('p').each((_i, el) => {
      const text = $(el).text().trim()
      if (text.length > 40) paras.push(text)
    })
    contentText = paras.join('\n\n')
    contentHtml = paras.map(p => `<p>${p}</p>`).join('\n')
  }

  const method = contentText.length > 150 ? 'cheerio' : 'meta-only'

  return {
    title: meta.title,
    content: contentText.slice(0, 8000),
    htmlContent: contentHtml.slice(0, 20000),
    summary: meta.description,
    author: meta.author,
    publishedAt: meta.publishedAt,
    featuredImage: meta.image,
    readingTimeMinutes: estimateReadingMinutes(contentText),
    source: meta.source,
    extractionMethod: method,
  }
}

/** Try @extractus/article-extractor if available (optional dependency) */
async function tryArticleExtractor(url: string): Promise<ExtractedArticle | null> {
  try {
    // Dynamic import with variable prevents TS static module resolution error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pkg = '@extractus/article-extractor'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(/* webpackIgnore: true */ pkg).catch(() => null)
    if (!mod?.extract) return null

    const result = await mod.extract(url, {}, {
      headers: FETCH_HEADERS as Record<string, string>,
    })
    if (!result || !result.content) return null

    const plainText = htmlToPlainText(result.content as string)
    if (plainText.length < 100) return null

    return {
      title: (result.title as string) || null,
      content: plainText.slice(0, 8000),
      htmlContent: (result.content as string).slice(0, 20000),
      summary: (result.description as string) || null,
      author: (result.author as string) || null,
      publishedAt: result.published ? new Date(result.published as string) : null,
      featuredImage: (result.image as string) || null,
      readingTimeMinutes: estimateReadingMinutes(plainText),
      source: (result.source as string) || null,
      extractionMethod: 'article-extractor',
    }
  } catch {
    return null
  }
}

/** Fetch raw HTML from URL */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('html')) return null

    const reader = res.body?.getReader()
    if (!reader) return null

    let html = ''
    let bytes = 0
    const decoder = new TextDecoder('utf-8', { fatal: false })
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      bytes += value?.length ?? 0
    }
    reader.cancel()
    return html
  } catch {
    return null
  }
}

/**
 * Main extraction function.
 * 1. Try @extractus/article-extractor
 * 2. Fallback: fetch HTML + cheerio
 * 3. Fallback: meta-only
 */
/**
 * Jina Reader fallback — wraps any URL via https://r.jina.ai/{url}
 * Returns clean markdown text that GPT can process.
 */
async function fetchViaJina(url: string): Promise<{ text: string; imageUrl: string | null } | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    const res = await fetch(jinaUrl, {
      headers: {
        Accept: 'text/plain',
        'X-Return-Format': 'markdown',
        'X-Timeout': '15',
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const raw = await res.text()

    // Extract first real image URL from markdown: ![alt](https://...)
    let imageUrl: string | null = null
    const imgMatch = raw.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/)
    if (imgMatch?.[1]) {
      const candidate = imgMatch[1]
      // Skip tiny icons/logos (likely < 50px based on URL patterns)
      if (!/icon|logo|sprite|placeholder|1x1|pixel/i.test(candidate)) {
        imageUrl = candidate
      }
    }

    // Strip markdown formatting, keep prose
    const clean = raw
      .replace(/^#+ .*/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return clean.length > 200 ? { text: clean.slice(0, 4000), imageUrl } : null
  } catch {
    return null
  }
}

export async function extractFullArticle(url: string): Promise<ExtractedArticle> {
  // Primary: @extractus/article-extractor (if installed)
  const extracted = await tryArticleExtractor(url)
  if (extracted && extracted.content.length > 150) return extracted

  // Fallback 1: fetch + cheerio
  const html = await fetchHtml(url)
  if (html && html.length > 500) {
    const cheerioResult = extractWithCheerio(html, url)
    if (cheerioResult.content.length > 200) return cheerioResult
  }

  // Fallback 2: Jina Reader — bypasses paywalls and JS-rendered sites
  const jinaResult = await fetchViaJina(url)
  if (jinaResult) {
    const wordCount = jinaResult.text.split(/\s+/).length
    return {
      title: null,
      content: jinaResult.text,
      htmlContent: `<p>${jinaResult.text.replace(/\n\n/g, '</p><p>')}</p>`,
      summary: jinaResult.text.slice(0, 200),
      author: null,
      publishedAt: null,
      featuredImage: jinaResult.imageUrl,
      readingTimeMinutes: Math.max(1, Math.round(wordCount / 200)),
      source: url,
      extractionMethod: 'jina',
    }
  }

  return {
    title: null,
    content: '',
    htmlContent: '',
    summary: null,
    author: null,
    publishedAt: null,
    featuredImage: null,
    readingTimeMinutes: 1,
    source: null,
    extractionMethod: 'failed',
  }
}

/** True when content is still thin after extraction */
export function isContentThin(content: string, summary: string): boolean {
  return (content + ' ' + summary).trim().length < 300
}
