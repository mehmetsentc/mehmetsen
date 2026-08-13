/**
 * Homepage “Öne Çıkan” pin helpers.
 * Firestore orderBy(featuredAt) drops docs missing the field; ranking also
 * needs a numeric pin time so newly marked RSS/external stories can surface.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'
import { isLocalScopedNews } from '@/lib/featuredScope'
import { HOME_FEATURED_LIMIT } from '@/types/newsItem'

function toEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value
  }
  if (value && typeof value === 'object') {
    const withMillis = value as { toMillis?: () => number }
    if (typeof withMillis.toMillis === 'function') {
      try {
        return withMillis.toMillis()
      } catch {
        /* fall through */
      }
    }
    const seconds =
      typeof (value as { seconds?: number }).seconds === 'number'
        ? (value as { seconds: number }).seconds
        : typeof (value as { _seconds?: number })._seconds === 'number'
          ? (value as { _seconds: number })._seconds
          : undefined
    if (typeof seconds === 'number' && Number.isFinite(seconds)) return seconds * 1000
  }
  return 0
}

export type FeaturedPinRow = {
  id: string
  featuredAt: number
  publishedAt: number
  /** Empty = national pin; otherwise city tenant slug. */
  scopeKey: string
}

/** Pin time for ranking — never 0 when the article has a publish date. */
export function featuredPinTime(data: {
  featuredAt?: unknown
  publishedAt?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}): number {
  return (
    toEpochMs(data.featuredAt) ||
    toEpochMs(data.publishedAt) ||
    toEpochMs(data.updatedAt) ||
    toEpochMs(data.createdAt) ||
    0
  )
}

/**
 * Write featuredAt on published featured docs that lack it (legacy pins).
 * Uses publish/update time so orderBy(featuredAt) includes them.
 */
export async function backfillMissingFeaturedAt(db: Firestore): Promise<number> {
  const snap = await db.collection(Collections.NEWS).where('featured', '==', true).get()
  let updated = 0

  for (const doc of snap.docs) {
    const data = doc.data()
    if (data.status !== 'published') continue
    if (toEpochMs(data.featuredAt) > 0) continue

    // Use publish time — never Date.now(), or legacy pins bury freshly marked ones.
    const featuredAt = featuredPinTime(data) || Date.now()

    await doc.ref.update({
      featuredAt,
      isEditorPick: true,
      featured: true,
    })
    updated += 1
  }

  return updated
}

/**
 * Keep at most `limit` pins per scope.
 * Scope keys off the Yerel category tree — not mere citySlug presence.
 * National (non-yerel) pins share one pool for nahaber.com, even with a city.
 * Each city's yerel pins share a pool for that city homepage featured rail.
 * Newest featuredAt wins; `keepId` is always retained when present.
 */
export async function demoteExcessFeaturedPins(
  db: Firestore,
  options?: { keepId?: string; limit?: number }
): Promise<number> {
  const limit = options?.limit ?? HOME_FEATURED_LIMIT
  const keepId = options?.keepId

  const snap = await db
    .collection(Collections.NEWS)
    .where('status', '==', 'published')
    .where('featured', '==', true)
    .get()

  const rows: FeaturedPinRow[] = snap.docs.map((doc) => {
    const data = doc.data()
    const citySlug = String(data.citySlug ?? '').trim().toLowerCase()
    const categoryId = String(data.categoryId ?? data.category ?? '').trim()
    // citySlug alone must not pull a national-category pin into a city pool.
    const local = isLocalScopedNews({ categoryId })
    return {
      id: doc.id,
      featuredAt: featuredPinTime(data),
      publishedAt: toEpochMs(data.publishedAt) || toEpochMs(data.createdAt),
      // Yerel without citySlug stays out of the national demotion pool.
      scopeKey: local ? (citySlug || `__yerel__:${doc.id}`) : '',
    }
  })

  const byScope = new Map<string, FeaturedPinRow[]>()
  for (const row of rows) {
    const list = byScope.get(row.scopeKey) ?? []
    list.push(row)
    byScope.set(row.scopeKey, list)
  }

  const demote: FeaturedPinRow[] = []
  for (const scoped of byScope.values()) {
    // One-off yerel docs without citySlug: never auto-demote against others.
    if (scoped.length === 1 && scoped[0].scopeKey.startsWith('__yerel__:')) {
      continue
    }
    scoped.sort((a, b) => {
      if (keepId) {
        if (a.id === keepId && b.id !== keepId) return -1
        if (b.id === keepId && a.id !== keepId) return 1
      }
      if (a.featuredAt !== b.featuredAt) return b.featuredAt - a.featuredAt
      return b.publishedAt - a.publishedAt
    })
    if (scoped.length > limit) demote.push(...scoped.slice(limit))
  }

  if (demote.length === 0) return 0

  const batchSize = 400
  let demoted = 0

  for (let i = 0; i < demote.length; i += batchSize) {
    const chunk = demote.slice(i, i + batchSize)
    const batch = db.batch()
    for (const row of chunk) {
      batch.update(db.collection(Collections.NEWS).doc(row.id), {
        featured: false,
        isEditorPick: false,
        featuredAt: FieldValue.delete(),
      })
    }
    await batch.commit()
    demoted += chunk.length
  }

  return demoted
}

