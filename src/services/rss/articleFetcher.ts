/**
 * Article fetcher — çok katmanlı extraction + arama fallback.
 * Used by rssEditor and newsroom pipeline.
 */
import { isContentThin } from '@/lib/fullArticleExtractor'
import { fetchEnrichedArticle } from '@/services/rss/enrichedArticleFetcher'

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
  _timeoutMs = 10_000,
  options?: { title?: string }
): Promise<ArticleEnrichment | null> {
  try {
    return await fetchEnrichedArticle(url, { title: options?.title, trySearch: true })
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
