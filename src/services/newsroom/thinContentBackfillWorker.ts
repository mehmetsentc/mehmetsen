/**
 * Thin Content Backfill Worker
 *
 * Yayında olan ama içeriği kısa (<500 karakter) haberleri yeniden işler:
 *   1) Jina + arama fallback ile tam metin çek
 *   2) 4 aşamalı AI editör ile NaHaber tarzında yeniden yaz
 *   3) Mevcut haberi güncelle (existingNewsId)
 *
 * Cron: her 6 saatte bir, run başına max 6 haber (AI maliyeti + timeout).
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { processNewsroomArticle } from '@/services/newsroom/pipeline'
import type { NewsroomArticleInput } from '@/services/newsroom/types'

function docContentLength(data: Record<string, unknown>): number {
  const body = String(data.description ?? data.content ?? '').trim()
  const summary = String(data.summary ?? '').trim()
  return (body + ' ' + summary).trim().length
}

export interface ThinContentBackfillResult {
  scanned: number
  candidates: number
  updated: number
  skipped: number
  failed: number
  archived: number
  errors: string[]
  durationMs: number
}

const THIN_CHARS = 500
const SCAN_LIMIT = 100
const MAX_PER_RUN = 8
const RETRY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const SCRAPER_RETRY_COOLDOWN_MS = 0

function isScraperArticle(docId: string, data: Record<string, unknown>): boolean {
  const editorType = String(data.editorType ?? '')
  if (['anka-breaking', 'anka-local', 'aa-content'].includes(editorType)) return true
  return (
    docId.startsWith('anka-breaking-') ||
    docId.startsWith('anka-local-') ||
    docId.startsWith('aa-')
  )
}

export async function runThinContentBackfillWorker(): Promise<ThinContentBackfillResult> {
  const started = Date.now()
  const result: ThinContentBackfillResult = {
    scanned: 0,
    candidates: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    archived: 0,
    errors: [],
    durationMs: 0,
  }

  const db = getAdminFirestore()
  const now = Date.now()

  let snap
  try {
    snap = await db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(SCAN_LIMIT)
      .get()
  } catch (err) {
    result.errors.push(`query failed: ${err instanceof Error ? err.message : String(err)}`)
    result.durationMs = Date.now() - started
    return result
  }

  const candidates = snap.docs
    .filter((doc) => {
      const data = doc.data()
      if (docContentLength(data) >= THIN_CHARS) return false
      const sourceUrl = String(data.sourceUrl ?? '').trim()
      if (!sourceUrl.startsWith('http')) return false
      const lastAttempt = Number(data.contentBackfillAt ?? 0)
      const cooldown = isScraperArticle(doc.id, data)
        ? SCRAPER_RETRY_COOLDOWN_MS
        : RETRY_COOLDOWN_MS
      if (lastAttempt && now - lastAttempt < cooldown) return false
      return true
    })
    .sort((a, b) => {
      const aScraper = isScraperArticle(a.id, a.data()) ? 0 : 1
      const bScraper = isScraperArticle(b.id, b.data()) ? 0 : 1
      return aScraper - bScraper
    })

  result.scanned = snap.size
  result.candidates = candidates.length

  const batch = candidates.slice(0, MAX_PER_RUN)

  for (const doc of batch) {
    const data = doc.data()
    const sourceUrl = String(data.sourceUrl).trim()
    const title = String(data.title ?? data.originalTitle ?? '').trim()
    if (!title) {
      result.skipped++
      continue
    }

    // Deneme zamanını işaretle (başarısız olsa bile cooldown)
    await doc.ref.update({ contentBackfillAt: now }).catch(() => {})

    const input: NewsroomArticleInput = {
      editorId: (String(data.editorId ?? data.ingestionSourceId ?? 'national-news') as NewsroomArticleInput['editorId']),
      editorType:
        data.editorType === 'local' || data.editorType === 'breaking'
          ? data.editorType
          : 'national',
      sourceLabel: String(data.sourceLabel ?? data.source ?? data.author ?? 'NaHaber'),
      sourceUrl,
      originalTitle: title,
      originalSummary: String(data.summary ?? data.spot ?? '').trim(),
      originalContent: String(data.description ?? data.content ?? '').trim(),
      imageUrl: String(data.coverImageUrl ?? data.thumbnail ?? '').trim() || undefined,
      forcedCategoryId: String(data.categoryId ?? data.category ?? '').trim() || undefined,
      rssFingerprint: `backfill:${doc.id}`,
    }

    try {
      const pipelineResult = await processNewsroomArticle(db, input, {
        changeType: 'updated',
        existingNewsId: doc.id,
      })

      if (pipelineResult.outcome === 'updated' || pipelineResult.outcome === 'published') {
        result.updated++
        await doc.ref.update({
          contentBackfillAt: now,
          contentBackfillStatus: 'success',
          updatedAt: now,
        }).catch(() => {})
      } else if (pipelineResult.outcome === 'skipped') {
        result.skipped++
        // Hâlâ içerik çekilemiyorsa ve çok kısaysa arşivle
        const len = docContentLength(data)
        if (len < 120) {
          await doc.ref.update({
            status: 'archived',
            contentBackfillStatus: 'archived_thin',
            moderationNote: 'İnce içerik — otomatik arşivlendi',
            updatedAt: now,
          }).catch(() => {})
          result.archived++
        } else {
          await doc.ref.update({ contentBackfillStatus: 'skipped' }).catch(() => {})
        }
      } else {
        result.failed++
        await doc.ref.update({ contentBackfillStatus: 'failed' }).catch(() => {})
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`${doc.id}: ${msg}`)
      result.failed++
    }
  }

  result.durationMs = Date.now() - started
  console.log(
    `[thin-backfill] scanned=${result.scanned} candidates=${result.candidates} ` +
    `updated=${result.updated} skipped=${result.skipped} archived=${result.archived} failed=${result.failed}`
  )
  return result
}
