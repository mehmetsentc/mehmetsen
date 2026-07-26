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
 *
 * GÖRSEL GÜVENLİĞİ: Arama fallback'i alternatif URL'lerden gelen görseli KULLANMAZ.
 * Yalnızca primary (kaynak) URL'den gelen görsel kabul edilir. Bu sayede farklı
 * makalelerin görseli sosyal medya paylaşımlarına karışmaz (örn. kaza görseli kutlama
 * haberine gitmez).
 */
export async function fetchEnrichedArticle(
  url: string,
  options?: { title?: string; trySearch?: boolean }
): Promise<ArticleEnrichment | null> {
  const title = options?.title?.trim()
  const trySearch = options?.trySearch !== false

  // Orijinal makalenin görseli — search fallback içerik kullanılsa bile bu korunur
  let primaryImageUrl: string | null = null

  // 1) Doğrudan kaynak URL
  try {
    const primary = await extractFullArticle(url)
    const primaryMapped = mapExtracted(primary)
    primaryImageUrl = primaryMapped.imageUrl  // Görsel her zaman kaynak URL'den alınır
    if (contentLength(primaryMapped) >= MIN_GOOD_CHARS) {
      return primaryMapped
    }
    if (contentLength(primaryMapped) >= MIN_ACCEPTABLE_CHARS && !trySearch) {
      return primaryMapped
    }
  } catch {
    // fall through to search
  }

  // 2) Canlı arama — alternatif URL'lerden YALNIZCA metin içeriği kullanılır.
  // Görsel (imageUrl) orijinal makalenin görseli olarak kalır; bu sayede sosyal
  // medya paylaşımlarında yanlış görsel gönderilmez.
  if (trySearch && title) {
    const altUrls = await searchArticleUrls(title, url)
    for (const altUrl of altUrls) {
      try {
        const alt = await extractFullArticle(altUrl)
        const mapped = mapExtracted(alt)
        if (contentLength(mapped) >= MIN_ACCEPTABLE_CHARS) {
          console.log(`[enrichedFetcher] search hit (metin): ${altUrl.slice(0, 80)}`)
          // Görseli orijinal makaleyle değiştir — alternatif URL'in görseli kullanılmaz
          return { ...mapped, imageUrl: primaryImageUrl }
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
