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

/** Strip Turkish RSS "read more" truncation artifacts */
function sanitizeRss(text: string): string {
  if (!text) return ''
  return text
    .replace(/\s*Devam[ıi]\s*(için|iç[^a-z]|oku[^y]|etmek).*$/i, '')
    .replace(/\s*Haberin devam[ıi].*$/i, '')
    .replace(/\s*Haberin?\s+tam[a-z]*\s+(için|metin).*$/i, '')
    .replace(/\s*\[.*?devam.*?\]/gi, '')
    .replace(/\s*\(devam[ıi].*?\)/gi, '')
    .replace(/\s*…+$/, '')
    .replace(/\s*\.{3,}$/, '')
    .trim()
}

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
      // Disabled or missing — skip quietly (worker ID lists may lag behind registry)
      result.itemsSkipped += 1
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

      // Always fetch the full article page for every RSS item
      let enrichedSummary = item.summary
      let enrichedContent = item.content
      let enrichedImageUrl = item.imageUrl
      let enrichedHtmlBody: string | undefined
      let enrichedReadingTime: number | undefined
      let enrichedAuthor: string | undefined

      if (item.link) {
        try {
          const article = await fetchArticleEnrichment(item.link, 10_000, { title: item.title })
          if (article) {
            // Always prefer extracted image
            if (article.imageUrl) enrichedImageUrl = article.imageUrl
            // Always prefer extracted full content over RSS snippet
            if (article.bodyText && article.bodyText.length > 150) {
              enrichedContent = article.bodyText
            }
            if (article.description && (!enrichedSummary || enrichedSummary.length < 80)) {
              enrichedSummary = article.description
            }
            if (article.htmlBody) enrichedHtmlBody = article.htmlBody
            if (article.readingTimeMinutes) enrichedReadingTime = article.readingTimeMinutes
            if (article.author) enrichedAuthor = article.author
          }
        } catch {
          // non-blocking — proceed with whatever we have
        }
      }

      // Strip RSS truncation artifacts before thin-content check
      enrichedSummary = sanitizeRss(enrichedSummary)
      enrichedContent = sanitizeRss(enrichedContent)

      // İçerik hâlâ inceyse pipeline quality gate atlayacak — uydurma içerik YOK
      if (isThinContent(enrichedSummary, enrichedContent)) {
        console.warn(
          `[rssEditor/${options.editorId}] thin content after extraction, pipeline may skip: ${item.link}`
        )
      }

      const input: NewsroomArticleInput = {
        editorId: options.editorId,
        editorType: options.editorType,
        sourceLabel: item.source.label,
        sourceUrl: item.link,
        originalTitle: item.title,
        originalSummary: enrichedSummary,
        originalContent: enrichedContent,
        htmlContent: enrichedHtmlBody,
        readingTimeMinutes: enrichedReadingTime,
        extractedAuthor: enrichedAuthor,
        imageUrl: enrichedImageUrl ?? undefined,
        rssFingerprint: item.fingerprint,
        rssGuid: item.guid,
        ingestionSourceId: item.source.id,
        sourcePublishedAt: item.publishedAt,
        forcedCategoryId: options.forcedCategoryId,
        isBreaking: options.isBreaking,
        // Always let pipeline do final AI rewrite for quality (Gemini/OpenAI/DeepSeek)
        // skipAiRewrite intentionally not set — even GPT-pre-filled content benefits from pipeline rewrite
        ...enriched,
      }

      let outcome: string
      let lowConfidence: boolean | undefined
      try {
        const pipelineResult = await processNewsroomArticle(db, input)
        outcome = pipelineResult.outcome
        lowConfidence = pipelineResult.lowConfidence
      } catch (pipelineErr) {
        const msg = pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr)
        console.error(`[rssEditor/${options.editorId}] pipeline threw (uncaught):`, msg)
        outcome = 'failed'
      }
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
