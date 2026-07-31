/**
 * Delete stale newsQueue rows so backlog cannot revive day-old stories.
 */
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { MAX_QUEUE_AGE_MS } from '@/services/newsroom/queue/freshness'

const PURGE_STATUSES = new Set(['pending', 'failed', 'dead_letter'])

export interface QueuePurgeStats {
  deleted: number
  details: Record<string, number>
  cutoffDate: string
  maxAgeHours: number
}

export async function purgeStaleQueueItems(
  db: Firestore = getAdminFirestore(),
  olderThanMs = MAX_QUEUE_AGE_MS
): Promise<QueuePurgeStats> {
  const cutoff = Date.now() - olderThanMs
  const col = db.collection(Collections.NEWS_QUEUE)
  let deleted = 0
  const details: Record<string, number> = {}
  let lastDoc: QueryDocumentSnapshot | null = null
  let scannedEmptyRounds = 0

  // Page through createdAt < cutoff. Skip finished rows; delete pending/failed/dead_letter.
  while (true) {
    let q = col.where('createdAt', '<', cutoff).orderBy('createdAt', 'asc').limit(400)
    if (lastDoc) q = q.startAfter(lastDoc)

    const snap = await q.get()
    if (snap.empty) break

    lastDoc = snap.docs[snap.docs.length - 1]!
    const batch = db.batch()
    let batchCount = 0

    for (const doc of snap.docs) {
      const status = (doc.data() as { status?: string }).status ?? 'unknown'
      if (!PURGE_STATUSES.has(status)) continue
      batch.delete(doc.ref)
      details[status] = (details[status] ?? 0) + 1
      batchCount += 1
      deleted += 1
    }

    if (batchCount > 0) {
      await batch.commit()
      scannedEmptyRounds = 0
    } else {
      scannedEmptyRounds += 1
      // Only published/skipped/processing in this window — keep paging a bit, then stop
      if (scannedEmptyRounds >= 5) break
    }

    if (snap.size < 400) break
  }

  return {
    deleted,
    details,
    cutoffDate: new Date(cutoff).toISOString(),
    maxAgeHours: Math.round(olderThanMs / (60 * 60 * 1000)),
  }
}
