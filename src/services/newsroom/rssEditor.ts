/**
 * Shared RSS fetch + pipeline runner for scheduled newsroom editors.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { fetchRssItems, type RssFeedItem } from '@/services/rss/rssFetcher'
import { getRssSourceById } from '@/services/rss/sources'
import { processNewsroomArticle } from '@/services/newsroom/pipeline'
import { MAX_AI_CALLS_PER_EDITOR } from '@/services/newsroom/config'
import type { EditorId, NewsroomArticleInput, NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'
import { fetchArticleEnrichment, isThinContent } from '@/services/rss/articleFetcher'

export interface RssEditorOptions {
  sourceIds: readonly string[]
  editorId: EditorId
  editorType: NewsroomArticleInput['editorType']
  forcedCategoryId?: string
  isBreaking?: boolean
  maxAiCalls?: number
  maxItemsPerSource?: number
  /** Per-item overrides (e.g. breaking priority from RSS title). */
  enrichInput?: (item: RssFeedItem) => Partial<NewsroomArticleInput>
}

export async function runRssEditor(options: RssEditorOptions): Promise<NewsroomRunResult> {
  const started = Date.now()
  const result = emptyNewsroomResult(options.editorId)
  const db = getAdminFirestore()
  const maxAiCalls = options.maxAiCalls ?? MAX_AI_CALLS_PER_EDITOR
  let aiCalls = 0

  for (const sourceId of options.sourceIds) {
    const source = getRssSourceById(sourceId)
    if (!source) {
      result.errors.push(`Unknown RSS source: ${sourceId}`)
      continue
    }

    result.sourcesChecked += 1

    let items: RssFeedItem[]
    try {
      items = await fetchRssItems(source, {
        maxItems: options.maxItemsPerSource ?? source.maxItemsPerRun,
      })
    } catch (error) {
      const msg = `[${options.editorId}:${sourceId}] RSS fetch failed: ${
        error instanceof Error ? error.message : String(error)
      }`
      console.warn(msg)
      result.errors.push(msg)
      continue
    }

    result.itemsFetched += items.length

    for (const item of items) {
      if (aiCalls >= maxAiCalls) {
        result.errors.push(`AI call cap (${maxAiCalls}) reached`)
        break
      }

      const enriched = options.enrichInput?.(item) ?? {}

      // Enrich thin-content or imageless items by fetching the actual article page
      let enrichedSummary = item.summary
      let enrichedContent = item.content
      let enrichedImageUrl = item.imageUrl

      const needsEnrichment =
        isThinContent(item.summary, item.content) || !item.imageUrl
      if (needsEnrichment && item.link) {
        try {
          const article = await fetchArticleEnrichment(item.link, 7000)
          if (article) {
            if (!enrichedImageUrl && article.imageUrl) {
              enrichedImageUrl = article.imageUrl
            }
            if (isThinContent(enrichedSummary, enrichedContent)) {
              enrichedSummary = article.description ?? enrichedSummary
              enrichedContent = article.bodyText ?? article.description ?? enrichedContent
            }
          }
        } catch {
          // non-blocking — proceed with whatever we have
        }
      }

      const input: NewsroomArticleInput = {
        editorId: options.editorId,
        editorType: options.editorType,
        sourceLabel: item.source.label,
        sourceUrl: item.link,
        originalTitle: item.title,
        originalSummary: enrichedSummary,
        originalContent: enrichedContent,
        imageUrl: enrichedImageUrl ?? undefined,
        rssFingerprint: item.fingerprint,
        rssGuid: item.guid,
        ingestionSourceId: item.source.id,
        sourcePublishedAt: item.publishedAt,
        forcedCategoryId: options.forcedCategoryId,
        isBreaking: options.isBreaking,
        ...enriched,
      }

      const { outcome, lowConfidence } = await processNewsroomArticle(db, input)
      aiCalls += 1

      if (outcome === 'published' || outcome === 'updated') {
        result.itemsNew += 1
        result.autoPublished += 1
      } else if (outcome === 'created') {
        result.itemsNew += 1
        result.draftsCreated += 1
        if (lowConfidence) result.lowConfidence += 1
      } else if (outcome === 'skipped') {
        result.itemsSkipped += 1
      } else {
        result.itemsFailed += 1
      }
    }

    if (aiCalls >= maxAiCalls) break
  }

  result.durationMs = Date.now() - started
  return result
}
