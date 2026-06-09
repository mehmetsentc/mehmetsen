/**
 * SEO Maintenance Worker — 24 saatte bir çalışır.
 *
 * Görevler:
 * 1. Eksik slug olan yayınlanmış haberlere slug üretir
 * 2. seoTitle / seoDescription boş olan haberleri title/summary'den doldurur
 * 3. İçeriği çok kısa (<200 karakter) olan taslakları (newsDrafts) temizler
 * 4. Yaşlı (30+ gün) ve yayınlanmamış taslakları arşive taşır
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { buildNewsSlug } from '@/lib/newsSlug'

export interface SeoMaintenanceResult {
  slugsGenerated: number
  seoFieldsBackfilled: number
  thinDraftsRemoved: number
  staleDraftsArchived: number
  errors: string[]
  durationMs: number
}

const STALE_DRAFT_DAYS = 30
const THIN_CONTENT_CHARS = 200
const BATCH_LIMIT = 50

export async function runSeoMaintenanceWorker(): Promise<SeoMaintenanceResult> {
  const started = Date.now()
  const result: SeoMaintenanceResult = {
    slugsGenerated: 0,
    seoFieldsBackfilled: 0,
    thinDraftsRemoved: 0,
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

    // 2. Backfill seoTitle / seoDescription from title/summary
    try {
      const noSeoSnap = await db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .where('seoTitle', '==', '')
        .limit(BATCH_LIMIT)
        .get()

      const batch = db.batch()
      for (const doc of noSeoSnap.docs) {
        const data = doc.data()
        if (!data.seoTitle && data.title) {
          batch.update(doc.ref, {
            seoTitle: String(data.title).slice(0, 70),
            seoDescription: String(data.summary || data.description || '').slice(0, 165),
            updatedAt: now,
          })
          result.seoFieldsBackfilled++
        }
      }
      if (result.seoFieldsBackfilled > 0) await batch.commit()
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

    // 4. Archive stale pending_review drafts (> 30 days old)
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

    console.log(`[seo-maintenance] slugs=${result.slugsGenerated} seo=${result.seoFieldsBackfilled} thin=${result.thinDraftsRemoved} stale=${result.staleDraftsArchived}`)
  } catch (err) {
    result.errors.push(`worker failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  result.durationMs = Date.now() - started
  return result
}
