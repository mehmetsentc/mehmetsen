import type { CollectionReference, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { chunkIds } from '@/lib/firestoreIn'

function publishedAtMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber) && value.trim() !== '') return asNumber
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}

/**
 * Published-news read for a category family larger than Firestore's `in` cap.
 * Each chunk keeps the index order: status → categoryId → publishedAt.
 * Results are merged newest-first and cut to `limitCount`.
 */
export async function fetchDocsByCategoryFamily(params: {
  collection: CollectionReference
  family: readonly string[]
  limitCount: number
  publishedAtGte?: number
  publishedAtLt?: number
}): Promise<QueryDocumentSnapshot[]> {
  const ids = [...new Set(params.family.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0 || params.limitCount <= 0) return []

  const chunks = chunkIds(ids)
  const byId = new Map<string, QueryDocumentSnapshot>()

  await Promise.all(
    chunks.map(async (chunk) => {
      let q = params.collection.where('status', '==', 'published')
      q = chunk.length > 1 ? q.where('categoryId', 'in', chunk) : q.where('categoryId', '==', chunk[0]!)
      if (params.publishedAtGte != null) q = q.where('publishedAt', '>=', params.publishedAtGte)
      if (params.publishedAtLt != null) q = q.where('publishedAt', '<', params.publishedAtLt)
      const snap = await q.orderBy('publishedAt', 'desc').limit(params.limitCount).get()
      for (const doc of snap.docs) {
        if (!byId.has(doc.id)) byId.set(doc.id, doc)
      }
    })
  )

  return [...byId.values()]
    .sort((a, b) => publishedAtMs(b.get('publishedAt')) - publishedAtMs(a.get('publishedAt')))
    .slice(0, params.limitCount)
}
