/**
 * Article fetcher — wraps fullArticleExtractor with the legacy interface.
 * Used by rssEditor to enrich RSS items with full article content.
 */
import { extractFullArticle, isContentThin } from '@/lib/fullArticleExtractor'

export interface ArticleEnrichment {
  imageUrl: string | null
  description: string | null
  bodyText: string | null
  htmlBody: string | null
  author: string | null
  publishedAt: Date | null
  readingTimeMinutes: number
  extractionMethod: string
}

/**
 * Fetch and extract a full article from URL.
 * Returns null on failure (non-blocking).
 */
export async function fetchArticleEnrichment(
  url: string,
  _timeoutMs = 10_000
): Promise<ArticleEnrichment | null> {
  try {
    const result = await extractFullArticle(url)
    return {
      imageUrl: result.featuredImage,
      description: result.summary,
      bodyText: result.content || null,
      htmlBody: result.htmlContent || null,
      author: result.author,
      publishedAt: result.publishedAt,
      readingTimeMinutes: result.readingTimeMinutes,
      extractionMethod: result.extractionMethod,
    }
  } catch {
    return null
  }
}

/**
 * True when content is thin and needs article fetching.
 * High threshold — we always want the full article.
 */
export function isThinContent(summary: string, content: string): boolean {
  return isContentThin(content, summary)
}
