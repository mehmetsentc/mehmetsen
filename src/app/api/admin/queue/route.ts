/**
 * POST /api/admin/queue
 *   body { action: 'process-one', id: string } → reset + process single queue item
 *   body { action: 'purge-duplicates', hardDelete?: boolean, limit?: number, useAi?: boolean }
 *   body { action: 'compare-duplicates', id: string, useAi?: boolean } → quality vs peer
 *
 * DELETE /api/admin/queue?id=<itemId>          → delete single queue item
 * DELETE /api/admin/queue?purgeOlderThan=6|12|24 → bulk purge pending items older than N hours
 * DELETE /api/admin/queue?purgeDuplicates=1&hard=1 → remove weaker queue duplicates
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { processNewsQueue } from '@/services/newsroom/queue/queueProcessor'
import { sweepQueueDuplicates, findQueuePeerDuplicate } from '@/services/newsroom/queue/queueDuplicateSweep'
import {
  aiPickBetterQueueItem,
  compareQueueQuality,
  scoreFromArticleInput,
} from '@/services/newsroom/queue/queueQualityCompare'
import type { NewsQueueDocument } from '@/services/newsroom/queue/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const PURGE_STATUSES = new Set(['pending', 'failed', 'dead_letter'])

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(request: Request) {
  const auth = await verifyCmsToken(request, 'cron:trigger')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getAdminFirestore()
  const url = new URL(request.url)
  const itemId = url.searchParams.get('id')?.trim()
  const purgeHoursRaw = url.searchParams.get('purgeOlderThan')?.trim()
  const purgeDuplicates = url.searchParams.get('purgeDuplicates') === '1'
  const hardDelete = url.searchParams.get('hard') === '1'

  // ── Single item delete ──────────────────────────────────────────────────────
  if (itemId) {
    const ref = db.collection(Collections.NEWS_QUEUE).doc(itemId)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await ref.delete()
    return NextResponse.json({ ok: true, deleted: 1 })
  }

  // ── Bulk: düşük kaliteli kuyruk tekrarlarını sil / skip ─────────────────────
  if (purgeDuplicates) {
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') ?? '350', 10) || 350,
      500
    )
    const stats = await sweepQueueDuplicates(db, {
      limit,
      softSkip: !hardDelete,
      useAiForBorderline: url.searchParams.get('useAi') === '1',
    })
    return NextResponse.json({ ok: true, ...stats })
  }

  // ── Bulk purge older than N hours ───────────────────────────────────────────
  const hours = purgeHoursRaw ? Number(purgeHoursRaw) : NaN
  if (!Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json(
      { error: 'Provide ?id=<itemId> or ?purgeOlderThan=6|12|24 or ?purgeDuplicates=1' },
      { status: 400 }
    )
  }

  const cutoff = Date.now() - hours * 60 * 60 * 1000
  const col = db.collection(Collections.NEWS_QUEUE)
  let deleted = 0
  let lastDoc = null as FirebaseFirestore.QueryDocumentSnapshot | null

  while (true) {
    let q = col
      .where('createdAt', '<', cutoff)
      .orderBy('createdAt', 'asc')
      .limit(400)
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
      batchCount++
      deleted++
    }
    if (batchCount > 0) await batch.commit()
    if (snap.size < 400) break
  }

  return NextResponse.json({ ok: true, deleted, olderThanHours: hours })
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'cron:trigger')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    id?: string
    hardDelete?: boolean
    limit?: number
    useAi?: boolean
  }

  const db = getAdminFirestore()

  if (body.action === 'purge-duplicates') {
    const stats = await sweepQueueDuplicates(db, {
      limit: Math.min(body.limit ?? 350, 500),
      softSkip: !body.hardDelete,
      useAiForBorderline: body.useAi === true,
    })
    return NextResponse.json({ ok: true, ...stats })
  }

  if (body.action === 'compare-duplicates') {
    if (!body.id) {
      return NextResponse.json({ error: 'Provide id' }, { status: 400 })
    }
    const snap = await db.collection(Collections.NEWS_QUEUE).doc(body.id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
    }
    const data = snap.data() as NewsQueueDocument
    const peer = await findQueuePeerDuplicate(db, data, body.id)
    if (!peer) {
      return NextResponse.json({
        ok: true,
        isDuplicate: false,
        qualityScore: scoreFromArticleInput(data.input),
        message: 'Kuyrukta benzer haber bulunamadı',
      })
    }

    const peerSnap = await db.collection(Collections.NEWS_QUEUE).doc(peer.peerQueueId).get()
    const peerData = peerSnap.data() as NewsQueueDocument | undefined
    const fullHeuristic = peerData
      ? compareQueueQuality(
          {
            title: data.input.originalTitle,
            summary: data.input.originalSummary,
            content: data.input.originalContent,
            imageUrl: data.input.imageUrl,
            sourceLabel: data.input.sourceLabel,
          },
          {
            title: peerData.input.originalTitle,
            summary: peerData.input.originalSummary,
            content: peerData.input.originalContent,
            imageUrl: peerData.input.imageUrl,
            sourceLabel: peerData.input.sourceLabel,
          }
        )
      : compareQueueQuality(
          {
            title: data.input.originalTitle,
            summary: data.input.originalSummary,
            content: data.input.originalContent,
            imageUrl: data.input.imageUrl,
            sourceLabel: data.input.sourceLabel,
          },
          { title: peer.peerTitle }
        )

    let ai: { keep: 'a' | 'b'; reason: string } | null = null
    if (body.useAi && peerData) {
      ai = await aiPickBetterQueueItem(
        {
          title: data.input.originalTitle,
          summary: data.input.originalSummary,
          content: data.input.originalContent,
          imageUrl: data.input.imageUrl,
        },
        {
          title: peerData.input.originalTitle,
          summary: peerData.input.originalSummary,
          content: peerData.input.originalContent,
          imageUrl: peerData.input.imageUrl,
        }
      )
    }

    const keepSelf =
      ai?.keep === 'a' ||
      (!ai && fullHeuristic.keep === 'a') ||
      (!ai && fullHeuristic.keep === 'tie')

    await db.collection(Collections.NEWS_QUEUE).doc(body.id).update({
      queueDuplicateSuspect: true,
      queueDuplicateOf: peer.peerQueueId,
      queueDuplicateRole: keepSelf ? 'keeper' : 'weaker',
      queueDuplicateSimilarity: peer.similarity,
      qualityScore: fullHeuristic.scoreA,
      peerQualityScore: fullHeuristic.scoreB,
      updatedAt: Date.now(),
    })

    return NextResponse.json({
      ok: true,
      isDuplicate: true,
      peerQueueId: peer.peerQueueId,
      peerTitle: peer.peerTitle,
      similarity: peer.similarity,
      qualityScore: fullHeuristic.scoreA,
      peerQualityScore: fullHeuristic.scoreB,
      keepSelf,
      heuristic: fullHeuristic,
      ai,
      decisionReason: ai?.reason ?? fullHeuristic.reason,
    })
  }

  if (body.action !== 'process-one' || !body.id) {
    return NextResponse.json(
      { error: 'Provide { action: "process-one"|"purge-duplicates"|"compare-duplicates", id? }' },
      { status: 400 }
    )
  }

  const ref = db.collection(Collections.NEWS_QUEUE).doc(body.id)
  const snap = await ref.get()
  if (!snap.exists) {
    return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
  }

  const data = snap.data() as NewsQueueDocument

  // Reset item: clear lease, reset attempts, schedule immediately
  await ref.update({
    status: 'pending',
    leaseOwner: null,
    leaseExpiresAt: null,
    claimedAt: null,
    attempts: Math.max(0, (data.attempts ?? 1) - 1), // give one retry credit
    scheduledAt: Date.now(),
    updatedAt: Date.now(),
    lastError: null,
  })

  // Process queue with batchSize=1 so only this (or next fresh) item runs
  const result = await processNewsQueue(db, 1, { skipFreshnessCheck: true })

  return NextResponse.json({
    ok: true,
    itemId: body.id,
    picked: result.picked,
    published: result.published,
    drafted: result.drafted,
    failed: result.failed,
    skipped: result.skipped,
  })
}
