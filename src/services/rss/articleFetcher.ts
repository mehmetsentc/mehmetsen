/**
 * Fetches a news article page and extracts:
 * - og:image (or first large inline image)
 * - og:description / meta description (richer summary)
 * - article body text (for thin-content RSS items)
 *
 * Used to enrich IHA/DHA/Google News RSS items that carry only title+link.
 */

const ARTICLE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
}

export interface ArticleEnrichment {
  imageUrl: string | null
  description: string | null
  bodyText: string | null
}

/** Extract content from a raw HTML string (no DOM parser needed). */
function parseHtml(html: string): ArticleEnrichment {
  // --- og:image ---
  const ogImage =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ??
    null

  // --- twitter:image as fallback ---
  const twitterImage =
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)?.[1] ??
    null

  // --- og:description ---
  const ogDesc =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,}?)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']{20,}?)["'][^>]+property=["']og:description["']/i)?.[1] ??
    null

  // --- meta description ---
  const metaDesc =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,}?)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']{20,}?)["'][^>]+name=["']description["']/i)?.[1] ??
    null

  // --- article body: try <article>, then main content div heuristics ---
  const bodyText = extractBodyText(html)

  const imageUrl = (ogImage ?? twitterImage ?? null)?.trim() || null
  const description = (ogDesc ?? metaDesc ?? null)?.replace(/\s+/g, ' ').trim() || null

  return { imageUrl, description, bodyText }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractBodyText(html: string): string | null {
  // 1. Try <article> tag
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  if (articleMatch?.[1]) {
    const text = stripHtml(articleMatch[1])
    if (text.length > 150) return text.slice(0, 3000)
  }

  // 2. Try common article content divs
  const contentPatterns = [
    /class=["'][^"']*(?:haber[-_]?detay|article[-_]?content|news[-_]?content|haber[-_]?icerik|icerik|haberMetin|haberContent|news[-_]?body|article[-_]?body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /id=["'][^"']*(?:haberDetay|articleContent|newsContent|haberIcerik|newsBody|articleBody)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ]

  for (const pattern of contentPatterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      const text = stripHtml(match[1])
      if (text.length > 150) return text.slice(0, 3000)
    }
  }

  // 3. Collect <p> tags with enough text
  const paragraphs: string[] = []
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let m: RegExpExecArray | null
  while ((m = pRegex.exec(html)) !== null) {
    const text = stripHtml(m[1])
    if (text.length > 40) paragraphs.push(text)
    if (paragraphs.join(' ').length > 2000) break
  }
  if (paragraphs.length >= 2) return paragraphs.join('\n\n').slice(0, 3000)

  return null
}

/**
 * Fetch and enrich an article URL.
 * Returns null on any network/parse error (non-blocking).
 */
export async function fetchArticleEnrichment(
  url: string,
  timeoutMs = 8000
): Promise<ArticleEnrichment | null> {
  try {
    // Resolve Google News redirects and other short URLs
    const res = await fetch(url, {
      headers: ARTICLE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) return null

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) return null

    // Only read first 300KB to keep it fast
    const reader = res.body?.getReader()
    if (!reader) return null

    let html = ''
    let bytesRead = 0
    const maxBytes = 300_000

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder('utf-8', { fatal: false }).decode(value)
      bytesRead += value?.length ?? 0
    }
    reader.cancel()

    return parseHtml(html)
  } catch {
    return null
  }
}

/** True when an RSS item has thin content that warrants article fetching. */
export function isThinContent(summary: string, content: string): boolean {
  const combined = (summary + ' ' + content).trim()
  return combined.length < 250
}
