/**
 * SEO Maintenance Worker — 24 saatte bir çalışır.
 *
 * Görevler:
 * 1. Eksik slug olan yayınlanmış haberlere slug üretir
 * 2. seoTitle / seoDescription boş olan haberleri title/summary'den doldurur
 * 3. İçeriği çok kısa (<200 karakter) olan taslakları (newsDrafts) temizler
 * 4. Pipeline kaynaklı görselsiz pending_review taslaklarını soft-reject eder
 * 5. Yaşlı (30+ gün) ve yayınlanmamış taslakları arşive taşır
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { buildNewsSlug, isPlaceholderDraftSlug } from '@/lib/newsSlug'
import { pingSitemaps } from '@/lib/seo'
import { buildNewsIndexNowUrl, submitIndexNowUrls } from '@/lib/indexNow'
import {
  hasUsableCoverImage,
  NO_COVER_IMAGE_REASON,
  resolveCoverImageUrl,
} from '@/lib/newsCoverImage'

export interface SeoMaintenanceResult {
  slugsGenerated: number
  seoFieldsBackfilled: number
  thinDraftsRemoved: number
  noImageDraftsRejected: number
  staleDraftsArchived: number
  errors: string[]
  durationMs: number
}

const STALE_DRAFT_DAYS = 30
const THIN_CONTENT_CHARS = 200
const BATCH_LIMIT = 50
const SEO_SCAN_LIMIT = 500

/** Pipeline / RSS / scraper drafts — not admin CMS manual creates. */
function isPipelineSourcedDraft(data: Record<string, unknown>): boolean {
  if (data.aiGenerated === true) return true
  if (typeof data.rssFingerprint === 'string' && data.rssFingerprint.trim()) return true
  if (typeof data.ingestionSourceId === 'string' && data.ingestionSourceId.trim()) return true
  if (typeof data.editorId === 'string' && data.editorId.trim()) return true
  return false
}

export async function runSeoMaintenanceWorker(): Promise<SeoMaintenanceResult> {
  const started = Date.now()
  const result: SeoMaintenanceResult = {
    slugsGenerated: 0,
    seoFieldsBackfilled: 0,
    thinDraftsRemoved: 0,
    noImageDraftsRejected: 0,
    staleDraftsArchived: 0,
    errors: [],
    durationMs: 0,
  }

  try {
    const db = getAdminFirestore()
    const now = Date.now()
    const staleThreshold = now - STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000

    // 1. Backfill missing slugs on published news
    try {
      const noSlugSnap = await db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .where('slug', '==', '')
        .limit(BATCH_LIMIT)
        .get()

      const batch = db.batch()
      for (const doc of noSlugSnap.docs) {
        const data = doc.data()
        const slug = buildNewsSlug(data.title ?? '', doc.id)
        if (slug) {
          batch.update(doc.ref, { slug, updatedAt: now })
          result.slugsGenerated++
        }
      }
      if (result.slugsGenerated > 0) await batch.commit()
    } catch (err) {
      result.errors.push(`slug backfill: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 2. Backfill seoTitle / seoDescription / slug on recent published (catches null + empty)
    try {
      const recentSnap = await db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(SEO_SCAN_LIMIT)
        .get()

      const batch = db.batch()
      let batchCount = 0

      for (const doc of recentSnap.docs) {
        const data = doc.data()
        const updates: Record<string, string | number> = {}

        if (!data.slug?.trim() && data.title) {
          const slug = buildNewsSlug(String(data.title), doc.id)
          if (slug) {
            updates.slug = slug
            result.slugsGenerated++
          }
        } else if (isPlaceholderDraftSlug(data.slug) && data.title) {
          const slug = buildNewsSlug(String(data.title), doc.id)
          if (slug && !isPlaceholderDraftSlug(slug)) {
            updates.slug = slug
            result.slugsGenerated++
          }
        }

        if (!data.seoTitle?.trim() && data.title) {
          updates.seoTitle = String(data.title).slice(0, 70)
        }

        if (!data.seoDescription?.trim()) {
          const desc = String(data.summary || data.description || data.title || '').trim()
          if (desc) updates.seoDescription = desc.slice(0, 165)
        }

        if (Object.keys(updates).length > 0) {
          updates.updatedAt = now
          batch.update(doc.ref, updates)
          if (updates.seoTitle || updates.seoDescription) result.seoFieldsBackfilled++
          batchCount++
        }
      }

      if (batchCount > 0) await batch.commit()
    } catch (err) {
      result.errors.push(`seo backfill: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 3. Remove thin drafts (description < THIN_CONTENT_CHARS)
    try {
      const draftsSnap = await db
        .collection(Collections.NEWS_DRAFTS)
        .where('draftStatus', '==', 'pending_review')
        .orderBy('createdAt', 'asc')
        .limit(BATCH_LIMIT)
        .get()

      const batch = db.batch()
      for (const doc of draftsSnap.docs) {
        const data = doc.data()
        const contentLen = (String(data.description || '') + String(data.content || '')).length
        if (contentLen < THIN_CONTENT_CHARS) {
          batch.delete(doc.ref)
          result.thinDraftsRemoved++
        }
      }
      if (result.thinDraftsRemoved > 0) await batch.commit()
    } catch (err) {
      result.errors.push(`thin draft cleanup: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 4. Soft-reject pipeline pending drafts without a usable cover image
    // (does NOT mass-delete historical published news).
    try {
      const noImageSnap = await db
        .collection(Collections.NEWS_DRAFTS)
        .where('draftStatus', '==', 'pending_review')
        .orderBy('createdAt', 'asc')
        .limit(BATCH_LIMIT)
        .get()

      const batch = db.batch()
      for (const doc of noImageSnap.docs) {
        const data = doc.data() as Record<string, unknown>
        if (!isPipelineSourcedDraft(data)) continue
        if (hasUsableCoverImage(resolveCoverImageUrl(data))) continue
        batch.update(doc.ref, {
          draftStatus: 'rejected',
          moderationNote: NO_COVER_IMAGE_REASON,
          pipelineSkipped: true,
          archivedAt: now,
          updatedAt: now,
        })
        result.noImageDraftsRejected++
      }
      if (result.noImageDraftsRejected > 0) await batch.commit()
    } catch (err) {
      result.errors.push(`no-image draft reject: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 4b. Soft-reject legacy news collection pending (Onay Bekliyor) without cover —
    // pipeline-sourced only; do not touch published history.
    try {
      const pendingNewsSnap = await db
        .collection(Collections.NEWS)
        .where('status', '==', 'pending')
        .limit(BATCH_LIMIT)
        .get()

      const batch = db.batch()
      let n = 0
      for (const doc of pendingNewsSnap.docs) {
        const data = doc.data() as Record<string, unknown>
        if (!isPipelineSourcedDraft(data)) continue
        if (hasUsableCoverImage(resolveCoverImageUrl(data))) continue
        batch.update(doc.ref, {
          status: 'archived',
          moderationNote: NO_COVER_IMAGE_REASON,
          pipelineSkipped: true,
          updatedAt: now,
        })
        n++
      }
      if (n > 0) {
        await batch.commit()
        result.noImageDraftsRejected += n
      }
    } catch (err) {
      result.errors.push(`no-image pending news reject: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 5. Archive stale pending_review drafts (> 30 days old)
    try {
      const staleSnap = await db
        .collection(Collections.NEWS_DRAFTS)
        .where('draftStatus', '==', 'pending_review')
        .where('createdAt', '<=', staleThreshold)
        .limit(BATCH_LIMIT)
        .get()

      const batch = db.batch()
      for (const doc of staleSnap.docs) {
        batch.update(doc.ref, { draftStatus: 'rejected', archivedAt: now, updatedAt: now })
        result.staleDraftsArchived++
      }
      if (result.staleDraftsArchived > 0) await batch.commit()
    } catch (err) {
      result.errors.push(`stale draft archive: ${err instanceof Error ? err.message : String(err)}`)
    }

    console.log(
      `[seo-maintenance] slugs=${result.slugsGenerated} seo=${result.seoFieldsBackfilled}` +
        ` thin=${result.thinDraftsRemoved} noImage=${result.noImageDraftsRejected}` +
        ` stale=${result.staleDraftsArchived}`
    )

    // Ping sitemaps + submit recent article URLs to IndexNow (Bing/Yandex fast indexing)
    try {
      const recentUrlsSnap = await getAdminFirestore()
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .select('slug')
        .limit(25)
        .get()

      const urls = recentUrlsSnap.docs
        .map((doc) => {
          const slug = (doc.data().slug as string | undefined)?.trim()
          return slug ? buildNewsIndexNowUrl(slug) : null
        })
        .filter((url): url is string => Boolean(url))

      await Promise.allSettled([pingSitemaps(), submitIndexNowUrls(urls)])
    } catch (err) {
      result.errors.push(`indexnow: ${err instanceof Error ? err.message : String(err)}`)
    }
  } catch (err) {
    result.errors.push(`worker failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  result.durationMs = Date.now() - started
  return result
}
