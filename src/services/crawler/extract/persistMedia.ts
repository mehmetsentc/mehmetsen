import { selectEditorialHandoff, type EditorialImageResult } from '../extract/images'
import type { CrawlerStore } from '../store/types'
import type { CrawlerMetricName } from '../types'

export async function persistArticleImages(
  store: CrawlerStore,
  articleId: string,
  result: EditorialImageResult,
  now = new Date()
): Promise<void> {
  const seen = new Set(result.candidates.map((c) => c.normalizedUrl))
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
      qualityScore: candidate.qualityScore,
      contentHash: candidate.contentHash,
      perceptualHash: candidate.perceptualHash,
      isPrimary: Boolean(result.primary && result.primary.normalizedUrl === candidate.normalizedUrl && candidate.status === 'ACCEPTED'),
      status: candidate.status,
      rejectionReason: candidate.rejectionReason,
    })
  }
  const existing = await store.listArticleMedia(articleId)
  for (const row of existing) {
    if (seen.has(row.normalizedUrl)) continue
    if (row.status === 'REJECTED') continue
    await store.upsertArticleMedia({
      ...row,
      status: 'REJECTED',
      rejectionReason: row.rejectionReason || 'duplicate_variant',
      isPrimary: false,
    })
  }
  const handoff = selectEditorialHandoff(result)
  const status = handoff.primaryUrl ? 'EXTRACTED' : result.candidates.length ? 'NONE' : 'NONE'
  await store.updateRawArticle(articleId, {
    mainImageUrl: handoff.primaryUrl,
    imageUrls: [handoff.primaryUrl, ...handoff.extraUrls].filter((u): u is string => Boolean(u)),
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
  if (result.accepted.length) {
    await store.incrementMetric('image_accepted', result.accepted.length, now)
  }
  if (result.rejected.length) {
    await store.incrementMetric('image_candidates_rejected', result.rejected.length, now)
  }
  if (result.duplicateCount) {
    await store.incrementMetric('image_duplicates_removed', result.duplicateCount, now)
  }
  if (result.adRejected) {
    await store.incrementMetric('image_ads_rejected', result.adRejected, now)
  }
  if (result.logoRejected) {
    await store.incrementMetric('image_logos_rejected', result.logoRejected, now)
  }
  if (result.tinyRejected) {
    await store.incrementMetric('image_tiny_rejected', result.tinyRejected, now)
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
