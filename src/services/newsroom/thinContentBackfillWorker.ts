/**
 * Thin Content Backfill Worker
 *
 * Yayında olan ama gövdesi kısa (< MIN_NEWS_BODY_WORDS) haberleri yeniden işler:
 *   1) Jina + arama fallback ile tam metin çek
 *   2) AI pipeline ile NaHaber tarzında yeniden yaz
 *   3) Mevcut haberi güncelle (existingNewsId)
 *
 * Genişletilemeyen / kaynak URL’siz kısa haberler → taslak (AdSense ince içerik riski).
 * Cron: run başına max 8 haber (AI maliyeti + timeout).
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { countPlainWords, MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'
import { processNewsroomArticle } from '@/services/newsroom/pipeline'
import type { NewsroomArticleInput } from '@/services/newsroom/types'
import type { DocumentReference } from 'firebase-admin/firestore'
import { isLiveBroadcastTitle } from '@/lib/liveBroadcastDetect'

export function newsBodyPlainText(data: Record<string, unknown>): string {
  return String(data.description ?? data.content ?? data.body ?? '').trim()
}

export function newsBodyWordCount(data: Record<string, unknown>): number {
  return countPlainWords(newsBodyPlainText(data))
}

export interface ThinContentBackfillResult {
  scanned: number
  candidates: number
  updated: number
  skipped: number
  failed: number
  drafted: number
  errors: string[]
  durationMs: number
}

const SCAN_LIMIT = Number(process.env.THIN_BACKFILL_SCAN_LIMIT || 150)
const MAX_PER_RUN = Number(process.env.THIN_BACKFILL_MAX_PER_RUN || 8)
const MIN_WORDS = Number(process.env.THIN_BACKFILL_MIN_WORDS || MIN_NEWS_BODY_WORDS)
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

async function demoteToDraft(
  ref: DocumentReference,
  now: number,
  reason: string
): Promise<void> {
  await ref.update({
    status: 'draft',
    featured: false,
    isEditorPick: false,
    featuredAt: null,
    contentBackfillStatus: 'drafted_thin',
    moderationNote: reason,
    updatedAt: now,
  })
}

export async function runThinContentBackfillWorker(): Promise<ThinContentBackfillResult> {
  const started = Date.now()
  const result: ThinContentBackfillResult = {
    scanned: 0,
    candidates: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    drafted: 0,
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
      if (newsBodyWordCount(data) >= MIN_WORDS) return false
      const lastAttempt = Number(data.contentBackfillAt ?? 0)
      const cooldown = isScraperArticle(doc.id, data)
        ? SCRAPER_RETRY_COOLDOWN_MS
        : RETRY_COOLDOWN_MS
      if (lastAttempt && now - lastAttempt < cooldown) return false
      return true
    })
    .sort((a, b) => {
      // Önce kaynak URL’si olanlar (genişletilebilir), sonra kelime sayısı artan
      const aUrl = String(a.data().sourceUrl ?? '').startsWith('http') ? 0 : 1
      const bUrl = String(b.data().sourceUrl ?? '').startsWith('http') ? 0 : 1
      if (aUrl !== bUrl) return aUrl - bUrl
      const aScraper = isScraperArticle(a.id, a.data()) ? 0 : 1
      const bScraper = isScraperArticle(b.id, b.data()) ? 0 : 1
      if (aScraper !== bScraper) return aScraper - bScraper
      return newsBodyWordCount(a.data()) - newsBodyWordCount(b.data())
    })

  result.scanned = snap.size
  result.candidates = candidates.length

  const batch = candidates.slice(0, MAX_PER_RUN)

  for (const doc of batch) {
    const data = doc.data()
    const sourceUrl = String(data.sourceUrl ?? '').trim()
    const title = String(data.title ?? data.originalTitle ?? '').trim()
    const words = newsBodyWordCount(data)

    if (!title) {
      result.skipped++
      continue
    }

    // YouTube / boş gövde: summary→description doldur veya taslağa al
    const isVideoPost =
      data.postType === 'video' ||
      String(data.slug || '').startsWith('video-') ||
      String(data.rssFingerprint || '').startsWith('youtube-rss:')

    // Canlı/#Canlı/#shorts YouTube — doldurma; yayından çek
    if (isVideoPost && isLiveBroadcastTitle(title)) {
      try {
        await demoteToDraft(
          doc.ref,
          now,
          'YouTube canlı/#Canlı/#shorts — NaHaber video-only junk, otomatik taslak'
        )
        result.drafted++
      } catch (err) {
        result.failed++
        result.errors.push(
          `${doc.id}: live youtube demote failed: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      continue
    }

    if (words < 20 && isVideoPost) {
      const summary = String(data.summary || '').trim()
      const watch =
        sourceUrl.startsWith('http')
          ? sourceUrl
          : String(data.videoEmbedUrl || data.videoUrl || '').trim()
      const spot =
        summary.length >= 40
          ? summary.slice(0, 280)
          : `${title.replace(/\s*#Canlı\s*$/i, '').trim()}.`
      const body = [
        spot,
        '',
        summary.length > spot.length ? summary : '',
        '',
        watch ? `Video: ${watch}` : '',
        '',
        'Bu içerik YouTube kanalından otomatik alındı. Ayrıntılar videoda.',
      ]
        .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
        .join('\n')
        .trim()

      try {
        // Açıklamasız canlı yayınlar → taslak; en az özet varsa yayınlı tut + doldur
        if (summary.length < 40) {
          await demoteToDraft(
            doc.ref,
            now,
            'Boş YouTube gövdesi — CMS içerik yok, otomatik taslak'
          )
          result.drafted++
        } else {
          await doc.ref.update({
            spot,
            description: body,
            content: body,
            summary: summary || title.slice(0, 280),
            contentBackfillStatus: 'youtube_body_filled',
            contentBackfillAt: now,
            updatedAt: now,
          })
          result.updated++
        }
      } catch (err) {
        result.failed++
        result.errors.push(
          `${doc.id}: video fill failed: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      continue
    }

    // Kaynak URL yok → genişletilemez; AdSense için yayından taslağa al
    if (!sourceUrl.startsWith('http')) {
      try {
        await demoteToDraft(
          doc.ref,
          now,
          `İnce içerik (${words} kelime) — kaynak URL yok, otomatik taslak`
        )
        result.drafted++
      } catch (err) {
        result.failed++
        result.errors.push(`${doc.id}: draft failed: ${err instanceof Error ? err.message : String(err)}`)
      }
      continue
    }

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
        const fresh = await doc.ref.get()
        const freshData = fresh.data() ?? {}
        const freshWords = newsBodyWordCount(freshData)
        const status = String(freshData.status ?? '')

        if (status === 'draft') {
          result.drafted++
          await doc.ref.update({
            contentBackfillAt: now,
            contentBackfillStatus: 'drafted_by_pipeline',
          }).catch(() => {})
        } else if (status === 'published' && freshWords >= MIN_WORDS) {
          result.updated++
          await doc.ref.update({
            contentBackfillAt: now,
            contentBackfillStatus: 'success',
            updatedAt: now,
          }).catch(() => {})
        } else if (status === 'published' && freshWords < MIN_WORDS) {
          await demoteToDraft(
            doc.ref,
            now,
            `İnce içerik (${freshWords} kelime) — genişletme sonrası hâlâ kısa, taslak`
          )
          result.drafted++
        } else {
          result.drafted++
        }
      } else if (pipelineResult.outcome === 'created') {
        // Eski yol: newsDrafts'a yazıp yayını bırakıyordu — canlıyı taslağa al
        await demoteToDraft(
          doc.ref,
          now,
          `İnce içerik (${words} kelime) — genişletme yetersiz, otomatik taslak`
        )
        result.drafted++
      } else if (pipelineResult.outcome === 'skipped') {
        result.skipped++
        if (words < 120) {
          await demoteToDraft(
            doc.ref,
            now,
            `İnce içerik (${words} kelime) — kaynak genişletilemedi, otomatik taslak`
          )
          result.drafted++
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
    `updated=${result.updated} drafted=${result.drafted} skipped=${result.skipped} failed=${result.failed} minWords=${MIN_WORDS}`
  )
  return result
}
