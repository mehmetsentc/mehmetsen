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

/**
 * GPT fallback: when articleFetcher can't get real content (blocked site),
 * ask OpenAI to write a proper Turkish news article from the headline alone.
 */
async function generateArticleFromTitle(
  title: string,
  sourceLabel: string
): Promise<{ summary: string; content: string } | null> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
  const apiKey = openaiKey || deepseekKey
  if (!apiKey) return null

  const isDeepSeek = !openaiKey && Boolean(deepseekKey)
  const model = isDeepSeek
    ? (process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-chat')
    : (process.env.OPENAI_NEWS_MODEL?.trim() || 'gpt-4o-mini')
  const baseUrl = isDeepSeek
    ? 'https://api.deepseek.com/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions'

  const systemPrompt = `Sen NaHaber adlı Türkçe haber platformunun editörüsün.
Sana bir haber başlığı ve kaynak verilecek. Bu başlığa dayanarak gerçekçi, bilgilendirici bir haber içeriği yaz.

KURALLARI:
- Türkçe, akıcı gazetecilik dili kullan
- summary: 1-2 cümle, başlığı açıklayan özet (max 150 karakter)
- content: 3-5 paragraf (toplam 150-300 kelime), kaza/olay/konu hakkında detay ver
- Bilinmeyen detayları mantıklı şekilde varsay (kayıp sayısı bilinmiyorsa "detaylar araştırılıyor" gibi)
- Başlıkla çelişme, tutarlı ol
- Sadece JSON döndür: {"summary":"...","content":"..."}`

  const tryProvider = async (url: string, key: string): Promise<{ summary: string; content: string } | null> => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.5,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Başlık: "${title}"\nKaynak: ${sourceLabel}\n\nBu haberi yaz.` },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      })
      // 429 rate-limit → try fallback provider
      if (res.status === 429) return null
      if (!res.ok) return null
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const raw = json.choices?.[0]?.message?.content?.trim()
      if (!raw) return null
      const parsed = JSON.parse(raw) as { summary?: string; content?: string }
      const summary = parsed.summary?.trim() || ''
      const content = parsed.content?.trim() || ''
      if (content.length < 80) return null
      return { summary, content }
    } catch {
      return null
    }
  }

  // Primary provider
  const result = await tryProvider(baseUrl, apiKey)
  if (result) return result

  // Fallback: try the other provider on 429/failure
  if (openaiKey && deepseekKey) {
    return tryProvider('https://api.deepseek.com/v1/chat/completions', deepseekKey)
  }
  return null
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

      // Always fetch the full article page for every RSS item
      let enrichedSummary = item.summary
      let enrichedContent = item.content
      let enrichedImageUrl = item.imageUrl
      let enrichedHtmlBody: string | undefined
      let enrichedReadingTime: number | undefined
      let enrichedAuthor: string | undefined
      let aiGenerated = false

      if (item.link) {
        try {
          const article = await fetchArticleEnrichment(item.link, 10_000)
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

      // If content is still thin (site blocked scraper), use GPT to write article
      if (isThinContent(enrichedSummary, enrichedContent)) {
        try {
          const generated = await generateArticleFromTitle(item.title, item.source.label)
          if (generated && generated.content.length > 150) {
            enrichedSummary = generated.summary || enrichedSummary
            enrichedContent = generated.content
            aiGenerated = true
          }
        } catch {
          // non-blocking
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
