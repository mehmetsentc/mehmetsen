/**
 * Firestore-backed news processing queue with retry scheduling and lease claims.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'
import type { NewsQueueDocument, QueueEnqueueInput } from '@/services/newsroom/queue/types'

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_LEASE_MS = Number(process.env.NEWSROOM_QUEUE_LEASE_MS ?? 240_000)
const ATOMIC_CLAIM = process.env.NEWSROOM_QUEUE_ATOMIC_CLAIM !== '0'

function queueCollection(db: Firestore) {
  return db.collection(Collections.NEWS_QUEUE)
}

function leaseOwnerId(): string {
  return `lease-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
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
    leaseOwner: null,
    leaseExpiresAt: null,
    claimedAt: null,
    createdAt: now,
    scheduledAt: now,
    updatedAt: now,
  }

  const ref = await queueCollection(db).add(doc)
  return ref.id
}

/**
 * Reset stuck processing jobs whose lease expired back to pending/failed.
 */
export async function reclaimExpiredLeases(
  db: Firestore,
  limit = 20
): Promise<number> {
  const now = Date.now()
  const snap = await queueCollection(db)
    .where('status', '==', 'processing')
    .limit(Math.max(limit * 2, 16))
    .get()

  let reclaimed = 0
  for (const doc of snap.docs) {
    if (reclaimed >= limit) break
    const data = doc.data() as NewsQueueDocument
    const expires = data.leaseExpiresAt ?? 0
    // Legacy jobs without lease: reclaim if claimed/updated > 2x lease ago
    const staleWithoutLease =
      !data.leaseExpiresAt &&
      (data.claimedAt ?? data.updatedAt ?? 0) > 0 &&
      now - (data.claimedAt ?? data.updatedAt) > DEFAULT_LEASE_MS * 2

    if ((expires > 0 && expires <= now) || staleWithoutLease) {
      await doc.ref.update({
        status: data.attempts >= data.maxAttempts ? 'dead_letter' : 'pending',
        leaseOwner: null,
        leaseExpiresAt: null,
        claimedAt: null,
        scheduledAt: now,
        updatedAt: now,
        lastError: 'lease_expired_reclaimed',
      })
      reclaimed += 1
    }
  }
  return reclaimed
}

export async function releaseQueueClaim(
  db: Firestore,
  queueId: string
): Promise<void> {
  const now = Date.now()
  await queueCollection(db).doc(queueId).update({
    status: 'pending',
    leaseOwner: null,
    leaseExpiresAt: null,
    claimedAt: null,
    scheduledAt: now,
    updatedAt: now,
  })
}

export async function claimPendingQueueItems(
  db: Firestore,
  limit: number
): Promise<Array<{ id: string; data: NewsQueueDocument }>> {
  const now = Date.now()
  const claimed: Array<{ id: string; data: NewsQueueDocument }> = []
  const owner = leaseOwnerId()
  const leaseExpiresAt = now + DEFAULT_LEASE_MS

  if (ATOMIC_CLAIM) {
    await reclaimExpiredLeases(db, limit)
  }

  async function claimStatus(status: 'pending' | 'failed', remaining: number): Promise<void> {
    if (remaining <= 0) return

    const snap = await queueCollection(db)
      .where('status', '==', status)
      .orderBy('createdAt', 'asc')
      .limit(Math.max(remaining * 3, 12))
      .get()

    const due = snap.docs
      .map((doc) => ({ doc, data: doc.data() as NewsQueueDocument }))
      .filter(({ data }) => (data.scheduledAt ?? 0) <= now && data.attempts < data.maxAttempts)
      .slice(0, remaining)

    for (const { doc, data } of due) {
      if (claimed.length >= limit) break

      if (ATOMIC_CLAIM) {
        try {
          const ok = await db.runTransaction(async (tx) => {
            const fresh = await tx.get(doc.ref)
            if (!fresh.exists) return false
            const current = fresh.data() as NewsQueueDocument
            if (current.status !== status) return false
            if (current.scheduledAt > now || current.attempts >= current.maxAttempts) return false
            tx.update(doc.ref, {
              status: 'processing',
              leaseOwner: owner,
              leaseExpiresAt,
              claimedAt: now,
              updatedAt: now,
            })
            return true
          })
          if (!ok) continue
          claimed.push({
            id: doc.id,
            data: {
              ...data,
              status: 'processing',
              leaseOwner: owner,
              leaseExpiresAt,
              claimedAt: now,
            },
          })
        } catch (error) {
          console.warn(`[newsQueue] claim transaction failed for ${doc.id}:`, error)
        }
      } else {
        await doc.ref.update({
          status: 'processing',
          leaseOwner: owner,
          leaseExpiresAt,
          claimedAt: now,
          updatedAt: now,
        })
        claimed.push({
          id: doc.id,
          data: {
            ...data,
            status: 'processing',
            leaseOwner: owner,
            leaseExpiresAt,
            claimedAt: now,
          },
        })
      }
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
    leaseOwner: null,
    leaseExpiresAt: null,
    claimedAt: null,
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
      leaseOwner: null,
      leaseExpiresAt: null,
      claimedAt: null,
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
    leaseOwner: null,
    leaseExpiresAt: null,
    claimedAt: null,
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
    leaseOwner: null,
    leaseExpiresAt: null,
    claimedAt: null,
    updatedAt: Date.now(),
  })
}
