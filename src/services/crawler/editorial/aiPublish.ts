import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { isCrawlerAiDispatchEnabled } from '../dispatch'
import { draftPrefillFromRaw, rawArticleDisplay } from './prefill'
import { syncCrawlerEditorial } from './newsLink'
import type { CrawlerStore } from '../store/types'
import type { NewsSourceRecord, RawArticleRecord } from '../types'
import type { NewsroomArticleInput } from '@/services/newsroom/types'
import type { CmsRole } from '@/types/cms'
import { hasPermission } from '@/types/cms'

export {
  isRawArticleAiPublishEligible,
  AI_PUBLISH_TIMEOUT_SKIP_TR,
} from './aiPublishEligibility'
import { AI_PUBLISH_TIMEOUT_SKIP_TR } from './aiPublishEligibility'

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
  try {
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
    const input = buildNewsroomInputFromRaw(article, source)

    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const db = getAdminFirestore()
    const processArticle =
      opts.processArticle ??
      (await import('@/services/newsroom/pipeline')).processNewsroomArticle

    const result = await processArticle(db, input, { skipStoryLibraryDedupe: true })

    if (result.outcome === 'skipped') {
      const detail = result.skipReason?.trim()
      return {
        rawArticleId: opts.rawArticleId,
        outcome: 'skipped',
        newsId: result.newsId,
        error: detail ? `Atlandı: ${detail}` : 'Atlandı (mükerrer veya filtre)',
      }
    }

    if (result.outcome === 'failed' || !result.newsId) {
      const detail = result.skipReason?.trim()
      return {
        rawArticleId: opts.rawArticleId,
        outcome: 'error',
        error: detail || 'Haber oluşturulamadı',
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

export async function publishRawArticlesWithAi(opts: {
  store: CrawlerStore
  ids: string[]
  processArticle?: typeof import('@/services/newsroom/pipeline').processNewsroomArticle
  /** Override wall-clock budget (ms). Tests / local tuning. */
  budgetMs?: number
}): Promise<AiPublishBatchResult> {
  const unique = [...new Set(opts.ids.map((id) => id.trim()).filter(Boolean))]
  const batch = unique.slice(0, AI_PUBLISH_BATCH_CAP)
  const budgetMs = opts.budgetMs ?? AI_PUBLISH_WALL_CLOCK_BUDGET_MS
  const startedAt = Date.now()
  const result: AiPublishBatchResult = {
    requested: unique.length,
    published: 0,
    drafted: 0,
    skipped: 0,
    failed: 0,
    results: [],
    crawlerDispatchEnabled: isCrawlerAiDispatchEnabled(),
  }

  for (let i = 0; i < batch.length; i++) {
    if (i > 0 && Date.now() - startedAt > budgetMs) {
      const remaining = batch.slice(i)
      console.warn(
        `[aiPublish] wall-clock budget (${budgetMs / 1000}s) aşıldı — ${remaining.length} haber atlandı`
      )
      for (const rawArticleId of remaining) {
        result.results.push({
          rawArticleId,
          outcome: 'skipped',
          error: AI_PUBLISH_TIMEOUT_SKIP_TR,
        })
        result.skipped += 1
      }
      break
    }

    const rawArticleId = batch[i]!
    const item = await publishRawArticleWithAi({
      store: opts.store,
      rawArticleId,
      processArticle: opts.processArticle,
    })
    result.results.push(item)
    if (item.outcome === 'published' || item.outcome === 'updated') result.published += 1
    else if (item.outcome === 'draft') result.drafted += 1
    else if (item.outcome === 'skipped' || item.outcome === 'already_published') result.skipped += 1
    else result.failed += 1
  }

  return result
}
