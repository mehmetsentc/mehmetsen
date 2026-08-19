/**
 * Scraper worker'lar (Anka, AA) için ortak yayın akışı:
 *   1) İnce içerik → Jina + Serper ile zenginleştir
 *   2) Hâlâ ince → kuyruğa al (pipeline tam metin + AI dener)
 *   3) Yeterli içerik → doğrudan AI pipeline ile yayınla
 */
import type { Firestore } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/admin'
import { fetchEnrichedArticle } from '@/services/rss/enrichedArticleFetcher'
import { enqueueNewsItem } from '@/services/newsroom/queue/newsQueueService'
import { processNewsroomArticle } from '@/services/newsroom/pipeline'
import type { EditorId, NewsroomEditorType } from '@/services/newsroom/types'

export const SCRAPER_MIN_CHARS = 500

export interface ScraperArticlePayload {
  url: string
  title: string
  spot: string
  content: string
  thumbnail?: string
  publishedAt?: number
  keywords?: string[]
  videoUrl?: string
  videoEmbedUrl?: string
}

export function scraperTextLength(article: Pick<ScraperArticlePayload, 'spot' | 'content'>): number {
  return (article.content.trim() + ' ' + article.spot.trim()).trim().length
}

export async function enrichScraperArticle<T extends ScraperArticlePayload>(article: T): Promise<T> {
  if (scraperTextLength(article) >= SCRAPER_MIN_CHARS) return article

  try {
    const enriched = await fetchEnrichedArticle(article.url, { title: article.title })
    if (!enriched) return article

    const nextContent =
      enriched.bodyText && enriched.bodyText.length > article.content.length
        ? enriched.bodyText
        : article.content
    const nextSpot =
      enriched.description && enriched.description.length > article.spot.length
        ? enriched.description
        : article.spot

    return {
      ...article,
      content: nextContent,
      spot: nextSpot,
      thumbnail: article.thumbnail || enriched.imageUrl || undefined,
    }
  } catch (err) {
    console.warn(
      `[scraperPublish] enrich failed for ${article.url}:`,
      err instanceof Error ? err.message : err
    )
    return article
  }
}

export type ScraperPublishStatus = 'published' | 'updated' | 'draft' | 'queued' | 'skipped' | 'error'

export interface ScraperPublishConfig {
  docId: string
  fingerprint: string
  editorId: EditorId
  editorType: NewsroomEditorType
  sourceLabel: string
  preferredSlug?: string
  forcedCategoryId?: string
  isBreaking?: boolean
  priorityScore?: number
  forcedCity?: string
  forcedCitySlug?: string
  extraTags?: string[]
}

export async function publishScraperViaPipeline(
  db: Firestore,
  article: ScraperArticlePayload,
  config: ScraperPublishConfig
): Promise<ScraperPublishStatus> {
  const { isLegacyDirectAiEnabled } = await import('@/services/crawler/legacyFlags')
  if (!isLegacyDirectAiEnabled()) {
    const { resolveLegacyCrawlerStore, forwardLegacyRssItemToCrawler } = await import(
      '@/services/crawler/legacyRssAdapter'
    )
    const store = await resolveLegacyCrawlerStore()
    if (store) {
      const sources = await store.listSources()
      await forwardLegacyRssItemToCrawler({
        store,
        sources,
        legacySource: {
          id: config.editorId,
          label: config.sourceLabel,
          feedUrl: article.url,
          maxItemsPerRun: 1,
          enabled: true,
        },
        item: {
          link: article.url,
          title: article.title,
          summary: article.spot,
          content: article.content,
          publishedAt: article.publishedAt ?? null,
        },
      })
    }
    return 'queued'
  }

  const existing = await db.collection(Collections.NEWS).doc(config.docId).get()
  if (existing.exists) return 'skipped'

  const enriched = await enrichScraperArticle(article)
  const textLen = scraperTextLength(enriched)

  const pipelineInput = {
    editorId: config.editorId,
    editorType: config.editorType,
    sourceLabel: config.sourceLabel,
    sourceUrl: enriched.url,
    originalTitle: enriched.title,
    originalSummary: enriched.spot,
    originalContent: enriched.content,
    imageUrl: enriched.thumbnail,
    rssFingerprint: config.fingerprint,
    rssGuid: enriched.url,
    ingestionSourceId: config.editorId,
    sourcePublishedAt: enriched.publishedAt ?? null,
    ...(config.forcedCategoryId !== undefined ? { forcedCategoryId: config.forcedCategoryId } : {}),
    ...(config.forcedCity !== undefined ? { forcedCity: config.forcedCity } : {}),
    ...(config.forcedCitySlug !== undefined ? { forcedCitySlug: config.forcedCitySlug } : {}),
    ...(config.extraTags ?? enriched.keywords ? { extraTags: config.extraTags ?? enriched.keywords } : {}),
    ...(config.isBreaking !== undefined ? { isBreaking: config.isBreaking } : {}),
    ...(config.priorityScore !== undefined ? { priorityScore: config.priorityScore } : {}),
  }

  if (textLen < SCRAPER_MIN_CHARS) {
    await enqueueNewsItem(db, {
      workerId: config.editorId,
      changeType: 'new',
      sourceId: config.editorId,
      fingerprintHash: config.fingerprint,
      input: pipelineInput,
    })
    console.log(
      `[scraperPublish] ince içerik (${textLen} kar) → kuyruğa alındı: ${enriched.title.slice(0, 55)}`
    )
    return 'queued'
  }

  try {
    const result = await processNewsroomArticle(db, pipelineInput, {
      targetNewsId: config.docId,
      publishedAt: enriched.publishedAt,
      preferredSlug: config.preferredSlug,
    })

    const newsId = result.newsId ?? config.docId
    if (
      (result.outcome === 'published' || result.outcome === 'updated') &&
      enriched.videoUrl
    ) {
      await db
        .collection(Collections.NEWS)
        .doc(newsId)
        .update({
          videoUrl: enriched.videoUrl,
          videoEmbedUrl: enriched.videoEmbedUrl ?? '',
          hasVideo: true,
        })
        .catch(() => {})
    }

    if (result.outcome === 'published') return 'published'
    if (result.outcome === 'updated') return 'updated'
    if (result.outcome === 'created') return 'draft'
    if (result.outcome === 'skipped') return 'skipped'
    return 'error'
  } catch (err) {
    console.error('[scraperPublish] pipeline error:', err)
    return 'error'
  }
}
