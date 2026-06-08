/**
 * Firestore-backed news processing queue with retry scheduling.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'
import type { NewsQueueDocument, QueueEnqueueInput } from '@/services/newsroom/queue/types'

const DEFAULT_MAX_ATTEMPTS = 3

function queueCollection(db: Firestore) {
  return db.collection(Collections.NEWS_QUEUE)
}

export async function enqueueNewsItem(
  db: Firestore,
  item: QueueEnqueueInput
): Promise<string> {
  const now = Date.now()

  // Dedupe pending/processing jobs for same fingerprint
  const existing = await queueCollection(db)
    .where('fingerprintHash', '==', item.fingerprintHash)
    .where('status', 'in', ['pending', 'processing'])
    .limit(1)
    .get()

  if (!existing.empty) {
    return existing.docs[0]!.id
  }

  const doc: NewsQueueDocument = {
    status: 'pending',
    workerId: item.workerId,
    changeType: item.changeType,
    input: item.input,
    existingNewsId: item.existingNewsId ?? null,
    sourceId: item.sourceId,
    fingerprintHash: item.fingerprintHash,
    attempts: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    lastError: null,
    publishedNewsId: null,
    createdAt: now,
    scheduledAt: now,
    updatedAt: now,
  }

  const ref = await queueCollection(db).add(doc)
  return ref.id
}

export async function claimPendingQueueItems(
  db: Firestore,
  limit: number
): Promise<Array<{ id: string; data: NewsQueueDocument }>> {
  const now = Date.now()
  const claimed: Array<{ id: string; data: NewsQueueDocument }> = []

  async function claimStatus(status: 'pending' | 'failed', remaining: number): Promise<void> {
    if (remaining <= 0) return

    // Single-field index on status only — filter scheduledAt in memory for local dev
    // without requiring a composite index deploy.
    const snap = await queueCollection(db)
      .where('status', '==', status)
      .limit(Math.max(remaining * 4, 8))
      .get()

    const due = snap.docs
      .map((doc) => ({ doc, data: doc.data() as NewsQueueDocument }))
      .filter(({ data }) => data.scheduledAt <= now && data.attempts < data.maxAttempts)
      .sort((a, b) => a.data.scheduledAt - b.data.scheduledAt)
      .slice(0, remaining)

    for (const { doc, data } of due) {
      await doc.ref.update({
        status: 'processing',
        updatedAt: now,
      })

      claimed.push({ id: doc.id, data: { ...data, status: 'processing' } })
    }
  }

  await claimStatus('pending', limit)
  if (claimed.length < limit) {
    await claimStatus('failed', limit - claimed.length)
  }

  return claimed
}

export async function markQueuePublished(
  db: Firestore,
  queueId: string,
  newsId: string
): Promise<void> {
  const now = Date.now()
  await queueCollection(db).doc(queueId).update({
    status: 'published',
    publishedNewsId: newsId,
    lastError: null,
    updatedAt: now,
  })
}

export async function markQueueFailed(
  db: Firestore,
  queueId: string,
  error: string,
  attempts: number,
  maxAttempts: number
): Promise<void> {
  const now = Date.now()
  const nextAttempts = attempts + 1

  if (nextAttempts >= maxAttempts) {
    await queueCollection(db).doc(queueId).update({
      status: 'dead_letter',
      attempts: nextAttempts,
      lastError: error.slice(0, 500),
      updatedAt: now,
    })
    return
  }

  const backoffMs = Math.min(60_000, 2 ** nextAttempts * 5_000)
  await queueCollection(db).doc(queueId).update({
    status: 'failed',
    attempts: nextAttempts,
    lastError: error.slice(0, 500),
    scheduledAt: now + backoffMs,
    updatedAt: now,
  })
}

export async function markQueueSkipped(
  db: Firestore,
  queueId: string,
  reason: string
): Promise<void> {
  await queueCollection(db).doc(queueId).update({
    status: 'published',
    lastError: reason.slice(0, 200),
    updatedAt: Date.now(),
  })
}
