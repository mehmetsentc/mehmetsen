import type { EditorialImageResult } from '../extract/images'
import type { CrawlerStore } from '../store/types'
import type { CrawlerMetricName } from '../types'

export async function persistArticleImages(
  store: CrawlerStore,
  articleId: string,
  result: EditorialImageResult,
  now = new Date()
): Promise<void> {
  for (const candidate of result.candidates) {
    await store.upsertArticleMedia({
      articleId,
      mediaType: 'image',
      sourceUrl: candidate.sourceUrl,
      normalizedUrl: candidate.normalizedUrl,
      width: candidate.width,
      height: candidate.height,
      altText: candidate.alt,
      caption: candidate.caption,
      credit: candidate.credit,
      mimeType: candidate.mimeType,
      discoveryMethod: candidate.discoveryMethod,
      score: candidate.score,
      isPrimary: Boolean(result.primary && result.primary.normalizedUrl === candidate.normalizedUrl),
      status: candidate.status,
      rejectionReason: candidate.rejectionReason,
    })
  }
  const status = result.primary ? 'EXTRACTED' : result.candidates.length ? 'NONE' : 'NONE'
  await store.updateRawArticle(articleId, {
    mainImageUrl: result.primary?.sourceUrl ?? null,
    imageUrls: result.accepted.map((c) => c.sourceUrl),
    mediaStatus: status,
    mediaExtractedAt: now,
    primaryImageMethod: result.primary?.discoveryMethod ?? null,
    imageCandidateCount: result.candidates.length,
    imageRejectedCount: result.rejected.length,
  })
}

export async function recordImageMetrics(
  store: CrawlerStore,
  result: EditorialImageResult,
  now = new Date(),
  failed = false
): Promise<void> {
  if (failed) {
    await store.incrementMetric('image_extraction_failed', 1, now)
    return
  }
  if (result.candidates.length) {
    await store.incrementMetric('image_candidates_found', result.candidates.length, now)
  }
  if (result.rejected.length) {
    await store.incrementMetric('image_candidates_rejected', result.rejected.length, now)
  }
  if (result.primary) {
    await store.incrementMetric('articles_with_primary_image', 1, now)
    const method = result.primary.discoveryMethod
    let metric: CrawlerMetricName = 'primary_image_dom'
    if (method === 'jsonld' || method === 'jsonld_object') metric = 'primary_image_jsonld'
    else if (method === 'og' || method === 'twitter') metric = 'primary_image_og'
    await store.incrementMetric(metric, 1, now)
  } else {
    await store.incrementMetric('articles_without_image', 1, now)
  }
}
