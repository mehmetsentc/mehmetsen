/**
 * newsDrafts kuyruğunu AI ile yeniden işler.
 * Geçenler otomatik yayınlanır; kalıcı sorunlular (moderasyon / DRAFT_ONLY) atlanır.
 */
import { getAdminFirestore, Collections } from '@/lib/firebase/admin'
import { processNewsroomArticle } from '@/services/newsroom/pipeline'
import {
  NEWSROOM_DRAFT_REPROCESS_BATCH,
  NEWSROOM_DRAFT_REPROCESS_MAX_ATTEMPTS,
} from '@/services/newsroom/config'
import { enableAutoPublishForActiveEditors } from '@/lib/ai/editorial/aiEditorService'
import type { NewsroomArticleInput, EditorId, NewsroomEditorType } from '@/services/newsroom/types'

const HARD_SKIP_REASONS = new Set([
  'ai_editor_requires_approval',
  'hate',
  'violence',
  'sexual',
  'self-harm',
  'illegal',
])

function editorTypeOf(raw: unknown): NewsroomEditorType {
  const v = String(raw || 'national')
  if (
    v === 'local' ||
    v === 'national' ||
    v === 'breaking' ||
    v === 'trend' ||
    v === 'influencer' ||
    v === 'event'
  ) {
    return v
  }
  return 'national'
}

function editorIdOf(raw: unknown): EditorId {
  const v = String(raw || 'national-news')
  return v as EditorId
}

export interface DraftReprocessStats {
  scanned: number
  published: number
  stillDraft: number
  skipped: number
  failed: number
  editorsEnsured: number
}

export async function reprocessPendingDrafts(): Promise<DraftReprocessStats> {
  const stats: DraftReprocessStats = {
    scanned: 0,
    published: 0,
    stillDraft: 0,
    skipped: 0,
    failed: 0,
    editorsEnsured: 0,
  }

  try {
    const ensured = await enableAutoPublishForActiveEditors('draft-reprocess-cron')
    stats.editorsEnsured = ensured.updated.length
  } catch (err) {
    console.warn(
      '[draft-reprocess] enableAutoPublish failed:',
      err instanceof Error ? err.message : err
    )
  }

  const db = getAdminFirestore()
  const snap = await db
    .collection(Collections.NEWS_DRAFTS)
    .where('draftStatus', '==', 'pending_review')
    .orderBy('createdAt', 'desc')
    .limit(NEWSROOM_DRAFT_REPROCESS_BATCH * 3)
    .get()
    .catch(async () => {
      // Index yoksa basit sorgu
      return db
        .collection(Collections.NEWS_DRAFTS)
        .where('draftStatus', '==', 'pending_review')
        .limit(NEWSROOM_DRAFT_REPROCESS_BATCH * 3)
        .get()
    })

  const candidates = snap.docs
    .filter((d) => {
      const data = d.data()
      const attempts = Number(data.autoReprocessCount ?? 0)
      if (attempts >= NEWSROOM_DRAFT_REPROCESS_MAX_ATTEMPTS) return false
      const reasons = Array.isArray(data.moderationReasons)
        ? (data.moderationReasons as string[])
        : []
      if (reasons.some((r) => HARD_SKIP_REASONS.has(r) || r.startsWith('error:'))) return false
      if (!data.sourceUrl && !data.originalTitle && !data.title) return false
      return true
    })
    .slice(0, NEWSROOM_DRAFT_REPROCESS_BATCH)

  stats.scanned = candidates.length

  for (const doc of candidates) {
    const data = doc.data()
    const sourceUrl = String(data.sourceUrl || '').trim()
    const title = String(data.originalTitle || data.title || '').trim()
    if (!title) {
      stats.skipped += 1
      continue
    }

    const input: NewsroomArticleInput = {
      editorId: editorIdOf(data.editorId),
      editorType: editorTypeOf(data.editorType),
      sourceLabel: String(data.sourceLabel || data.source || 'NaHaber'),
      sourceUrl: sourceUrl || `draft://${doc.id}`,
      originalTitle: title,
      originalSummary: String(data.summary || data.spot || '').trim(),
      // Önceki AI gövdesi kaynak olarak kullanılır — retry iyileştirir
      originalContent: String(data.description || data.content || data.summary || '').trim(),
      imageUrl: String(data.coverImageUrl || data.thumbnail || '') || undefined,
      rssFingerprint: String(data.rssFingerprint || '').trim() || undefined,
      rssGuid: String(data.rssGuid || sourceUrl || doc.id),
      ingestionSourceId: String(data.ingestionSourceId || data.editorId || 'draft-reprocess'),
      sourcePublishedAt:
        typeof data.sourcePublishedAt === 'number' ? data.sourcePublishedAt : null,
      forcedCategoryId: String(data.categoryId || data.category || '') || undefined,
      forcedCity: data.city ? String(data.city) : undefined,
      forcedCitySlug: data.citySlug ? String(data.citySlug) : undefined,
      forcedDistrict: data.district ? String(data.district) : undefined,
      extraTags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      isBreaking: Boolean(data.isBreaking),
      priorityScore: typeof data.priorityScore === 'number' ? data.priorityScore : undefined,
      preferredAiEditorId: data.aiEditorId ? String(data.aiEditorId) : undefined,
      articleFormat:
        data.articleFormat === 'column' || data.articleFormat === 'analysis'
          ? data.articleFormat
          : 'standard',
    }

    try {
      const result = await processNewsroomArticle(db, input, {
        reprocessDraftId: doc.id,
      })
      if (result.outcome === 'published' || result.outcome === 'updated') {
        stats.published += 1
      } else if (result.outcome === 'created') {
        stats.stillDraft += 1
      } else if (result.outcome === 'skipped') {
        stats.skipped += 1
        await doc.ref.set(
          {
            autoReprocessCount: Number(data.autoReprocessCount ?? 0) + 1,
            autoReprocessAt: Date.now(),
            autoReprocessSkip: result.outcome,
          },
          { merge: true }
        )
      } else {
        stats.failed += 1
      }
      await new Promise((r) => setTimeout(r, 300))
    } catch (err) {
      stats.failed += 1
      console.error('[draft-reprocess]', doc.id, err)
    }
  }

  console.log(
    `[draft-reprocess] scanned=${stats.scanned} published=${stats.published} stillDraft=${stats.stillDraft} skipped=${stats.skipped} failed=${stats.failed}`
  )
  return stats
}
