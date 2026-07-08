/**
 * Çok katmanlı haber içeriği çekme:
 *   1) extractFullArticle (cheerio + article-extractor + Jina)
 *   2) Başarısızsa canlı arama ile alternatif URL'ler dene
 *
 * Uydurma içerik üretmez — kaynak metin gelmezse null döner.
 */
import { extractFullArticle, isContentThin } from '@/lib/fullArticleExtractor'
import { searchArticleUrls } from '@/lib/articleSearchFallback'
import type { ArticleEnrichment } from '@/services/rss/articleFetcher'

const MIN_GOOD_CHARS = 500
const MIN_ACCEPTABLE_CHARS = 300

function mapExtracted(
  result: Awaited<ReturnType<typeof extractFullArticle>>
): ArticleEnrichment {
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
}

function contentLength(enrichment: ArticleEnrichment): number {
  return (
    (enrichment.bodyText?.length ?? 0) +
    (enrichment.description?.length ?? 0)
  )
}

/**
 * Tam haber metnini çeker. Scraper başarısız olursa arama fallback dener.
 */
export async function fetchEnrichedArticle(
  url: string,
  options?: { title?: string; trySearch?: boolean }
): Promise<ArticleEnrichment | null> {
  const title = options?.title?.trim()
  const trySearch = options?.trySearch !== false

  // 1) Doğrudan kaynak URL
  try {
    const primary = await extractFullArticle(url)
    if (contentLength(mapExtracted(primary)) >= MIN_GOOD_CHARS) {
      return mapExtracted(primary)
    }
    if (contentLength(mapExtracted(primary)) >= MIN_ACCEPTABLE_CHARS && !trySearch) {
      return mapExtracted(primary)
    }
  } catch {
    // fall through to search
  }

  // 2) Canlı arama — alternatif URL'ler
  if (trySearch && title) {
    const altUrls = await searchArticleUrls(title, url)
    for (const altUrl of altUrls) {
      try {
        const alt = await extractFullArticle(altUrl)
        const mapped = mapExtracted(alt)
        if (contentLength(mapped) >= MIN_ACCEPTABLE_CHARS) {
          console.log(`[enrichedFetcher] search hit: ${altUrl.slice(0, 80)}`)
          return mapped
        }
      } catch {
        // try next URL
      }
    }
  }

  // 3) Son çare: primary'den ne geldiyse (ince de olsa)
  try {
    const last = await extractFullArticle(url)
    const mapped = mapExtracted(last)
    if (!isContentThin(mapped.bodyText ?? '', mapped.description ?? '')) {
      return mapped
    }
  } catch {
    // ignore
  }

  return null
}
