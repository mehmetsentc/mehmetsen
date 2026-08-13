/**
 * Firestore-backed news processing queue with retry scheduling and lease claims.
 */
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'
import { createDuplicateNewsStub, findStoryLibraryMatchQuick } from '@/services/newsroom/dedupe/storyLibraryService'
import type { QueueDuplicateHit } from '@/services/newsroom/queue/queueDuplicateCheck'
import { findQueuePeerDuplicate } from '@/services/newsroom/queue/queueDuplicateSweep'
import { scoreFromArticleInput } from '@/services/newsroom/queue/queueQualityCompare'
import type { NewsQueueDocument, QueueEnqueueInput } from '@/services/newsroom/queue/types'
import { staleQueueReason } from '@/services/newsroom/queue/freshness'

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

  const libraryQuick = await findStoryLibraryMatchQuick(db, {
    rssFingerprint: item.input.rssFingerprint ?? item.fingerprintHash,
    sourceUrl: item.input.sourceUrl,
    existingNewsId: item.existingNewsId,
  })
  if (libraryQuick) {
    console.log(
      `[enqueueNewsItem] duplicateLibraryHit skip enqueue → ${libraryQuick.firstNewsId}` +
        ` (${libraryQuick.matchMethod})`
    )
    return `library-skip-${item.fingerprintHash}`
  }

  // Dedupe pending/processing jobs for same fingerprint
  const existing = await queueCollection(db)
    .where('fingerprintHash', '==', item.fingerprintHash)
    .where('status', 'in', ['pending', 'processing'])
    .limit(1)
    .get()

  if (!existing.empty) {
    return existing.docs[0]!.id
  }

  const qualityScore = scoreFromArticleInput(item.input)

  // Near-duplicate already in queue (different fingerprint / cross-source)
  let peerFlags: Partial<NewsQueueDocument> = {}
  try {
    const probe: NewsQueueDocument = {
      status: 'pending',
      workerId: item.workerId,
      changeType: item.changeType,
      input: item.input,
      existingNewsId: item.existingNewsId ?? null,
      sourceId: item.sourceId,
      fingerprintHash: item.fingerprintHash,
      attempts: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      createdAt: now,
      scheduledAt: now,
      updatedAt: now,
    }
    const peer = await findQueuePeerDuplicate(db, probe)
    if (peer) {
      if (peer.dropSelf) {
        console.log(
          `[enqueueNewsItem] queuePeer weaker skip → ${peer.peerQueueId}` +
            ` (q=${peer.qualityScore}<${peer.peerQualityScore})`
        )
        return `peer-skip-${item.fingerprintHash}`
      }
      if (peer.dropPeer) {
        try {
          await markQueueSkipped(
            db,
            peer.peerQueueId,
            `queuePeerDuplicate:weaker:${peer.similarity.toFixed(2)}`
          )
          await queueCollection(db).doc(peer.peerQueueId).update({
            queueDuplicateSuspect: true,
            queueDuplicateRole: 'weaker',
            queueDuplicateSimilarity: peer.similarity,
            qualityScore: peer.peerQualityScore,
            peerQualityScore: peer.qualityScore,
          })
        } catch (err) {
          console.warn('[enqueueNewsItem] drop peer failed:', err)
        }
        peerFlags = {
          queueDuplicateSuspect: true,
          queueDuplicateOf: peer.peerQueueId,
          queueDuplicateRole: 'keeper',
          queueDuplicateSimilarity: peer.similarity,
          qualityScore,
          peerQualityScore: peer.peerQualityScore,
        }
      } else if (peer.needsReview) {
        peerFlags = {
          queueDuplicateSuspect: true,
          queueDuplicateOf: peer.peerQueueId,
          queueDuplicateRole: 'review',
          queueDuplicateSimilarity: peer.similarity,
          qualityScore,
          peerQualityScore: peer.peerQualityScore,
        }
        try {
          await queueCollection(db).doc(peer.peerQueueId).update({
            queueDuplicateSuspect: true,
            queueDuplicateRole: 'review',
            queueDuplicateSimilarity: peer.similarity,
            updatedAt: now,
          })
        } catch {
          /* non-critical */
        }
      }
    }
  } catch (err) {
    console.warn('[enqueueNewsItem] peer check failed:', err)
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
    qualityScore,
    ...peerFlags,
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

/**
 * Claim pending/failed queue jobs — always newest-first (createdAt DESC / LIFO).
 *
 * Kuyruk claim sırası: her zaman en yeni `createdAt` önce.
 * Hem cron `/api/cron/newsroom/process-queue` hem CMS "Kuyruğu hızlı işle"
 * (`/api/admin/newsroom/process-now`) bu fonksiyonu kullanır; batch/concurrency
 * aynı kalır, sadece hangi işlerin claim edildiği değişir.
 * Eski backlog taze haberi boğmasın — fair-share yok, bilinçli LIFO.
 */
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

  /** Newest page via DESC index, or ASC + limitToLast (same ASC composite index). */
  async function fetchNewestPage(
    status: 'pending' | 'failed',
    pageSize: number,
    cursor: QueryDocumentSnapshot | null,
    mode: 'desc' | 'asc-tail'
  ): Promise<{ docs: QueryDocumentSnapshot[]; exhausted: boolean }> {
    if (mode === 'desc') {
      let q = queueCollection(db)
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .limit(pageSize)
      if (cursor) q = q.startAfter(cursor)
      const snap = await q.get()
      return { docs: snap.docs, exhausted: snap.size < pageSize }
    }

    // ASC index only: limitToLast = kuyruğun en yeni N kaydı (FIFO başı değil).
    let q = queueCollection(db)
      .where('status', '==', status)
      .orderBy('createdAt', 'asc')
      .limitToLast(pageSize)
    if (cursor) q = q.endBefore(cursor)
    const snap = await q.get()
    // limitToLast ASC döner → reverse ederek newest-first iterasyon
    const docs = snap.docs.slice().reverse()
    return { docs, exhausted: snap.size < pageSize }
  }

  async function tryClaimDoc(
    status: 'pending' | 'failed',
    doc: QueryDocumentSnapshot,
    data: NewsQueueDocument
  ): Promise<boolean> {
    if (ATOMIC_CLAIM) {
      try {
        const ok = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref)
          if (!fresh.exists) return false
          const current = fresh.data() as NewsQueueDocument
          if (current.status !== status) return false
          if (current.scheduledAt > now || current.attempts >= current.maxAttempts) return false
          if (staleQueueReason(current)) return false
          tx.update(doc.ref, {
            status: 'processing',
            leaseOwner: owner,
            leaseExpiresAt,
            claimedAt: now,
            updatedAt: now,
          })
          return true
        })
        if (!ok) return false
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
        return true
      } catch (error) {
        console.warn(`[newsQueue] claim transaction failed for ${doc.id}:`, error)
        return false
      }
    }

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
    return true
  }

  async function claimStatus(status: 'pending' | 'failed', remaining: number): Promise<void> {
    if (remaining <= 0) return

    let mode: 'desc' | 'asc-tail' = 'desc'
    try {
      await fetchNewestPage(status, 1, null, 'desc')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (!msg.includes('index') && (error as { code?: number }).code !== 9) throw error
      console.warn(
        '[newsQueue] createdAt desc index missing — falling back to asc+limitToLast (still newest-first)'
      )
      mode = 'asc-tail'
    }

    let cursor: QueryDocumentSnapshot | null = null
    let pages = 0
    const maxPages = 8

    while (claimed.length < limit && pages < maxPages) {
      pages += 1
      const need = limit - claimed.length
      const pageSize = Math.max(need * 4, 40)
      const { docs, exhausted } = await fetchNewestPage(status, pageSize, cursor, mode)
      if (docs.length === 0) break

      // Next page: older than the oldest doc in this newest-first page
      cursor = docs[docs.length - 1]!

      for (const doc of docs) {
        if (claimed.length >= limit) break
        const data = doc.data() as NewsQueueDocument
        if ((data.scheduledAt ?? 0) > now || data.attempts >= data.maxAttempts) continue

        const stale = staleQueueReason(data)
        if (stale) {
          try {
            await markQueueSkipped(db, doc.id, stale)
          } catch (err) {
            console.warn(`[newsQueue] stale skip failed for ${doc.id}:`, err)
          }
          continue
        }

        await tryClaimDoc(status, doc, data)
      }

      if (exhausted) break
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
    status: 'skipped',
    lastError: reason.slice(0, 200),
    leaseOwner: null,
    leaseExpiresAt: null,
    claimedAt: null,
    updatedAt: Date.now(),
  })
}

/** Mark queue item as cross-source duplicate — no AI; optional tekrarlayan stub for audit. */
export async function markQueueDuplicate(
  db: Firestore,
  queueId: string,
  hit: QueueDuplicateHit,
  input: QueueEnqueueInput['input']
): Promise<{ stubId?: string }> {
  let stubId: string | undefined
  try {
    stubId = await createDuplicateNewsStub(db, input, {
      existingNewsId: hit.existingNewsId ?? 'unknown',
      reason: hit.reason,
    })
  } catch (err) {
    console.warn('[markQueueDuplicate] stub create failed:', err)
  }

  await queueCollection(db).doc(queueId).update({
    status: 'skipped',
    lastError: hit.reason.slice(0, 200),
    duplicateOf: hit.existingNewsId ?? null,
    duplicateStubId: stubId ?? null,
    queueDuplicateSuspect: Boolean(hit.peerQueueId || hit.libraryHit),
    queueDuplicateOf: hit.peerQueueId ?? hit.existingNewsId ?? null,
    queueDuplicateRole: hit.dropSelf ? 'weaker' : hit.dropPeer ? 'keeper' : 'review',
    queueDuplicateSimilarity: hit.similarity ?? null,
    qualityScore: hit.qualityScore ?? null,
    peerQualityScore: hit.peerQualityScore ?? null,
    leaseOwner: null,
    leaseExpiresAt: null,
    claimedAt: null,
    updatedAt: Date.now(),
  })

  return { stubId }
}
