import { crawlerTickLimits } from '../enabled'
import { extractEditorialImages, mediaFromStoredUrls } from '../extract/images'
import { persistArticleImages, recordImageMetrics } from '../extract/persistMedia'
import { fetchDocument, type FetchImpl } from '../http/fetchDocument'
import { canFetchUrl } from '../http/robots'
import type { CrawlerStore } from '../store/types'
import type { HostLookup } from '../url/ssrf'

export interface MediaTickResult {
  articlesChecked: number
  primaryFound: number
  noImage: number
  filteredCandidates: number
  extractionErrors: number
  refetched: number
}

export async function runMediaTick(opts: {
  store: CrawlerStore
  now?: Date
  startedAt?: number
  fetchImpl?: FetchImpl
  lookup?: HostLookup
}): Promise<MediaTickResult> {
  const now = opts.now ?? new Date()
  const tickStarted = opts.startedAt ?? Date.now()
  const mediaStarted = Date.now()
  const limits = crawlerTickLimits()
  const result: MediaTickResult = {
    articlesChecked: 0,
    primaryFound: 0,
    noImage: 0,
    filteredCandidates: 0,
    extractionErrors: 0,
    refetched: 0,
  }
  const pending = await opts.store.listPendingMediaArticles(limits.maxMediaArticlesPerTick)
  for (const article of pending) {
    if (Date.now() - tickStarted > limits.maxTickRuntimeMs) break
    if (Date.now() - mediaStarted > limits.maxMediaRuntimeMs) break
    result.articlesChecked += 1
    try {
      if (article.mainImageUrl || article.imageUrls.length) {
        const extracted = mediaFromStoredUrls(article.mainImageUrl, article.imageUrls)
        await persistArticleImages(opts.store, article.id, extracted, now)
        await recordImageMetrics(opts.store, extracted, now)
        if (extracted.primary) result.primaryFound += 1
        else result.noImage += 1
        result.filteredCandidates += extracted.rejected.length
        continue
      }
      if (result.refetched >= limits.maxMediaRefetchPerTick) {
        await opts.store.updateRawArticle(article.id, { mediaStatus: 'PENDING' })
        continue
      }
      const source = await opts.store.getSource(article.sourceId)
      if (!source || source.status === 'PAUSED' || source.status === 'DISABLED') {
        await opts.store.updateRawArticle(article.id, {
          mediaStatus: 'NONE',
          mediaExtractedAt: now,
        })
        result.noImage += 1
        continue
      }
      const url = article.canonicalUrl || article.originalUrl
      const robotsOk = await canFetchUrl({
        url,
        fetchImpl: opts.fetchImpl,
        lookup: opts.lookup,
        policy: source.robotsPolicy,
        sourceId: source.id,
      })
      if (!robotsOk) {
        await opts.store.updateRawArticle(article.id, {
          mediaStatus: 'FAILED',
          mediaExtractedAt: now,
        })
        result.extractionErrors += 1
        await opts.store.incrementMetric('image_extraction_failed', 1, now)
        continue
      }
      const fetched = await fetchDocument({
        url,
        fetchImpl: opts.fetchImpl,
        lookup: opts.lookup,
        sourceId: source.id,
      })
      result.refetched += 1
      if (!fetched.ok || !fetched.body) {
        await opts.store.updateRawArticle(article.id, {
          mediaStatus: 'FAILED',
          mediaExtractedAt: now,
        })
        result.extractionErrors += 1
        await opts.store.incrementMetric('image_extraction_failed', 1, now)
        continue
      }
      const extracted = extractEditorialImages(fetched.body, fetched.finalUrl || url)
      await persistArticleImages(opts.store, article.id, extracted, now)
      await recordImageMetrics(opts.store, extracted, now)
      if (extracted.primary) result.primaryFound += 1
      else result.noImage += 1
      result.filteredCandidates += extracted.rejected.length
    } catch {
      result.extractionErrors += 1
      await opts.store.updateRawArticle(article.id, {
        mediaStatus: 'FAILED',
        mediaExtractedAt: now,
      })
      await opts.store.incrementMetric('image_extraction_failed', 1, now)
    }
  }
  return result
}
