import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { combinedSourceText, countPlainWords } from '@/lib/contentQuality'
import { isCrawlerAiDispatchEnabled } from '../dispatch'
import { isManualEditorAiEnabled } from '../automatedAiPolicy'
import { runWithAiUsageContext } from '@/lib/ai/usage/context'
import { draftPrefillFromRaw, rawArticleDisplay } from './prefill'
import { syncCrawlerEditorial } from './newsLink'
import type { CrawlerStore } from '../store/types'
import type { NewsSourceRecord, RawArticleRecord } from '../types'
import type { NewsroomArticleInput } from '@/services/newsroom/types'
import type { CmsRole } from '@/types/cms'
import { hasPermission } from '@/types/cms'
import { formatAiPublishSkipReasonTr } from './aiPublishSkipReasons'

export {
  isRawArticleAiPublishEligible,
  AI_PUBLISH_TIMEOUT_SKIP_TR,
} from './aiPublishEligibility'
import { AI_PUBLISH_TIMEOUT_SKIP_TR } from './aiPublishEligibility'

export { formatAiPublishSkipReasonTr } from './aiPublishSkipReasons'

/** Editör AI onayla — PARTIAL / kısa gövde için her zaman kaynak yeniden çekilir. */
const EDITOR_ALWAYS_ENRICH = true
const EDITOR_ENRICH_MIN_CHARS = 500

export const AI_PUBLISH_BATCH_CAP = 25

/**
 * Leave headroom under Vercel `maxDuration` (300s). Without this, bulk AI
 * publish is killed mid-flight and the platform returns plain text
 * "An error occurred..." — which breaks `res.json()` on the CMS client.
 */
export const AI_PUBLISH_WALL_CLOCK_BUDGET_MS = Number(
  process.env.AI_PUBLISH_BUDGET_MS ?? 250_000
)

export type AiPublishOutcome = 'published' | 'draft' | 'updated' | 'skipped' | 'error' | 'already_published' | 'locked'

export interface AiPublishItemResult {
  rawArticleId: string
  outcome: AiPublishOutcome
  newsId?: string
  editPath?: string
  publicPath?: string
  error?: string
}

export interface AiPublishBatchResult {
  requested: number
  published: number
  drafted: number
  skipped: number
  failed: number
  results: AiPublishItemResult[]
  /** Crawler auto-dispatch gate — always false for editor-initiated publish. */
  crawlerDispatchEnabled: boolean
}

export function authorizeEditorAiPublish(role: CmsRole): { ok: true } | { ok: false; error: string } {
  if (!hasPermission(role, 'news:publish')) {
    return { ok: false, error: 'AI yayın için news:publish yetkisi gerekli' }
  }
  return { ok: true }
}

export function buildNewsroomInputFromRaw(
  article: RawArticleRecord,
  source: NewsSourceRecord | null
): NewsroomArticleInput {
  const prefill = draftPrefillFromRaw(article, source)
  const isLocal = Boolean(prefill.citySlug)
  const display = rawArticleDisplay(article)
  return {
    editorId: isLocal ? 'local-news' : 'national-news',
    editorType: isLocal ? 'local' : 'national',
    sourceLabel: prefill.sourceLabel || prefill.source || 'Crawler',
    sourceUrl: prefill.sourceUrl,
    originalTitle: prefill.originalTitle || prefill.title || '(başlıksız)',
    originalSummary: display.description || '',
    originalContent: prefill.content || display.description || '',
    imageUrl: prefill.thumbnail || undefined,
    rssFingerprint: `crawler-editor:${article.id}`,
    rssGuid: article.id,
    ingestionSourceId: article.sourceId,
    sourcePublishedAt: prefill.sourcePublishedAt ?? null,
    ...(prefill.citySlug ? { forcedCitySlug: prefill.citySlug } : {}),
  }
}

/**
 * Editör AI onayla: kısa RSS snippet / Kısmi extract varsa kaynak URL'den
 * gövdeyi yeniden çek. Başarılıysa ham kayda da yazar (yeniden denemede hazır olsun).
 */
export async function enrichThinBodyForEditorAi(opts: {
  store: CrawlerStore
  article: RawArticleRecord
  input: NewsroomArticleInput
}): Promise<NewsroomArticleInput> {
  if (!opts.input.sourceUrl?.startsWith('http')) return opts.input

  const sourceChars = combinedSourceText(opts.input.originalContent, opts.input.originalSummary).length
  const isPartial =
    opts.article.qualityStatus === 'PARTIAL' ||
    opts.article.qualityStatus === 'LOW_CONFIDENCE' ||
    opts.article.rssSnippetUsedAsBody
  const needsEnrich =
    EDITOR_ALWAYS_ENRICH || isPartial || sourceChars < EDITOR_ENRICH_MIN_CHARS
  if (!needsEnrich) return opts.input

  try {
    const { fetchArticleEnrichment } = await import('@/services/rss/articleFetcher')
    const extracted = await fetchArticleEnrichment(opts.input.sourceUrl, 18_000, {
      title: opts.input.originalTitle,
    })
    const body = extracted?.bodyText?.trim() || ''
    const currentLen = opts.input.originalContent?.length ?? 0
    // Kısmi/kısa kayıtta eşit uzunlukta bile JSON-LD temiz gövde tercih edilir
    if (!body || (body.length < currentLen && !isPartial && sourceChars >= EDITOR_ENRICH_MIN_CHARS)) {
      return opts.input
    }
    if (body.length <= 40) return opts.input

    const next: NewsroomArticleInput = {
      ...opts.input,
      originalContent: body,
      ...(extracted?.htmlBody ? { htmlContent: extracted.htmlBody } : {}),
      ...(extracted?.imageUrl && !opts.input.imageUrl ? { imageUrl: extracted.imageUrl } : {}),
    }

    await opts.store
      .updateRawArticle(opts.article.id, {
        articleBodyText: body,
        articleBodyHtml: extracted?.htmlBody || opts.article.articleBodyHtml,
        wordCount: countPlainWords(body),
        charCount: body.length,
        qualityStatus: body.length >= EDITOR_ENRICH_MIN_CHARS ? 'EXTRACTED' : opts.article.qualityStatus,
        rssSnippetUsedAsBody: false,
        ...(extracted?.imageUrl && !opts.article.mainImageUrl
          ? { mainImageUrl: extracted.imageUrl }
          : {}),
      })
      .catch((err) => {
        console.warn(
          `[aiPublish] enrich persist failed ${opts.article.id}:`,
          err instanceof Error ? err.message : err
        )
      })

    console.log(
      `[aiPublish] editor enrich: ${opts.article.id} ${sourceChars}→${body.length} kar (${opts.input.sourceUrl?.slice(0, 80)})`
    )
    return next
  } catch (err) {
    console.warn(
      `[aiPublish] editor enrich failed ${opts.article.id}:`,
      err instanceof Error ? err.message : err
    )
    return opts.input
  }
}

async function loadPublishedNews(newsId: string) {
  const db = getAdminFirestore()
  const snap = await db.collection(Collections.NEWS).doc(newsId).get()
  if (!snap.exists) return null
  const data = snap.data() || {}
  return {
    id: snap.id,
    status: String(data.status || 'draft'),
    slug: String(data.slug || ''),
  }
}

export async function publishRawArticleWithAi(opts: {
  store: CrawlerStore
  rawArticleId: string
  processArticle?: typeof import('@/services/newsroom/pipeline').processNewsroomArticle
}): Promise<AiPublishItemResult> {
  // This function is exclusively the human editor AI path (CMS enqueue / sync
  // ai-publish). Never require crawler/legacy flags — only MANUAL_EDITOR_AI.
  try {
    if (!isManualEditorAiEnabled()) {
      return {
        rawArticleId: opts.rawArticleId,
        outcome: 'skipped',
        error: 'MANUAL_EDITOR_AI_ENABLED=false (Manuel editör AI kapalı)',
      }
    }

    const article = await opts.store.getRawArticle(opts.rawArticleId)
    if (!article) return { rawArticleId: opts.rawArticleId, outcome: 'error', error: 'Ham haber bulunamadı' }

    if (article.editorialStatus === 'PUBLISHED') {
      const existing = article.editorialNewsId ? await loadPublishedNews(article.editorialNewsId) : null
      if (existing?.status === 'published') {
        return {
          rawArticleId: opts.rawArticleId,
          outcome: 'already_published',
          newsId: existing.id,
          editPath: `/admin/news/${existing.id}/edit`,
          publicPath: existing.slug ? `/haber/${existing.slug}` : undefined,
        }
      }
    }

    if (article.editorialStatus === 'DELETED') {
      return { rawArticleId: opts.rawArticleId, outcome: 'locked', error: 'Silinmiş kayıt' }
    }

    const source = await opts.store.getSource(article.sourceId)
    let input = buildNewsroomInputFromRaw(article, source)
    input = await enrichThinBodyForEditorAi({ store: opts.store, article, input })

    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const db = getAdminFirestore()
    const processArticle =
      opts.processArticle ??
      (await import('@/services/newsroom/pipeline')).processNewsroomArticle

    // skipStoryLibraryDedupe is the durable human-approval marker for pipeline
    // policy (survives ALS loss across dynamic imports). Also set ALS here for
    // provider gates that still read ingestionLane.
    const result = await runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () =>
      processArticle(db, input, { skipStoryLibraryDedupe: true })
    )

    if (result.outcome === 'skipped') {
      const code = result.skipReason?.trim() || ''
      const tr = formatAiPublishSkipReasonTr(code || null)

      if (code === 'already_published' || code === 'already_drafted') {
        const existing = result.newsId ? await loadPublishedNews(result.newsId) : null
        if (code === 'already_published' && existing?.status === 'published') {
          await syncCrawlerEditorial({
            rawArticleId: opts.rawArticleId,
            newsId: existing.id,
            status: 'published',
          }).catch(() => {})
          return {
            rawArticleId: opts.rawArticleId,
            outcome: 'already_published',
            newsId: existing.id,
            editPath: `/admin/news/${existing.id}/edit`,
            publicPath: existing.slug ? `/haber/${existing.slug}` : undefined,
            error: tr,
          }
        }
        if (result.newsId) {
          return {
            rawArticleId: opts.rawArticleId,
            outcome: code === 'already_drafted' ? 'draft' : 'already_published',
            newsId: result.newsId,
            editPath: `/admin/news/${result.newsId}/edit`,
            publicPath: existing?.slug ? `/haber/${existing.slug}` : undefined,
            error: tr,
          }
        }
      }

      return {
        rawArticleId: opts.rawArticleId,
        outcome: 'skipped',
        newsId: result.newsId,
        error: `Atlandı: ${tr}`,
      }
    }

    if (result.outcome === 'failed' || !result.newsId) {
      const detail = formatAiPublishSkipReasonTr(result.skipReason)
      return {
        rawArticleId: opts.rawArticleId,
        outcome: 'error',
        error: result.skipReason?.trim() ? detail : 'Haber oluşturulamadı',
      }
    }

    const news = await loadPublishedNews(result.newsId)
    const published = news?.status === 'published' || result.outcome === 'published' || result.outcome === 'updated'

    await syncCrawlerEditorial({
      rawArticleId: opts.rawArticleId,
      newsId: result.newsId,
      status: published ? 'published' : 'draft',
    })

    if (!published) {
      await opts.store.updateRawArticle(opts.rawArticleId, {
        editorialNewsId: result.newsId,
        editorialStatus: 'DRAFT',
      })
      return {
        rawArticleId: opts.rawArticleId,
        outcome: 'draft',
        newsId: result.newsId,
        editPath: `/admin/news/${result.newsId}/edit`,
      }
    }

    return {
      rawArticleId: opts.rawArticleId,
      outcome: result.outcome === 'updated' ? 'updated' : 'published',
      newsId: result.newsId,
      editPath: `/admin/news/${result.newsId}/edit`,
      publicPath: news?.slug ? `/haber/${news.slug}` : undefined,
    }
  } catch (err) {
    return {
      rawArticleId: opts.rawArticleId,
      outcome: 'error',
      error: err instanceof Error ? err.message : 'AI yayın başarısız',
    }
  }
}

export const AI_PUBLISH_CONCURRENCY = 4

export async function publishRawArticlesWithAi(opts: {
  store: CrawlerStore
  ids: string[]
  processArticle?: typeof import('@/services/newsroom/pipeline').processNewsroomArticle
  /** Override wall-clock budget (ms). Tests / local tuning. */
  budgetMs?: number
  /** Bounded concurrency. Default AI_PUBLISH_CONCURRENCY (4). */
  concurrency?: number
}): Promise<AiPublishBatchResult> {
  const unique = [...new Set(opts.ids.map((id) => id.trim()).filter(Boolean))]
  const batch = unique.slice(0, AI_PUBLISH_BATCH_CAP)
  const budgetMs = opts.budgetMs ?? AI_PUBLISH_WALL_CLOCK_BUDGET_MS
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? AI_PUBLISH_CONCURRENCY, batch.length || 1))
  const startedAt = Date.now()
  const result: AiPublishBatchResult = {
    requested: unique.length,
    published: 0,
    drafted: 0,
    skipped: 0,
    failed: 0,
    results: new Array<AiPublishItemResult>(batch.length),
    crawlerDispatchEnabled: isCrawlerAiDispatchEnabled(),
  }

  const queue = batch.map((rawArticleId, index) => ({ rawArticleId, index }))

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      if (Date.now() - startedAt > budgetMs) {
        const remaining = queue.splice(0, queue.length)
        if (remaining.length > 0) {
          console.warn(
            `[aiPublish] wall-clock budget (${budgetMs / 1000}s) aşıldı — ${remaining.length} haber atlandı`
          )
          for (const item of remaining) {
            result.results[item.index] = {
              rawArticleId: item.rawArticleId,
              outcome: 'skipped',
              error: AI_PUBLISH_TIMEOUT_SKIP_TR,
            }
          }
        }
        break
      }

      const next = queue.shift()
      if (!next) break

      const item = await runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () =>
        publishRawArticleWithAi({
          store: opts.store,
          rawArticleId: next.rawArticleId,
          processArticle: opts.processArticle,
        })
      )
      result.results[next.index] = item
    }
  })

  await Promise.all(workers)

  for (const item of result.results) {
    if (!item) continue
    if (item.outcome === 'published' || item.outcome === 'updated') result.published += 1
    else if (item.outcome === 'draft') result.drafted += 1
    else if (item.outcome === 'skipped' || item.outcome === 'already_published') result.skipped += 1
    else result.failed += 1
  }

  return result
}
