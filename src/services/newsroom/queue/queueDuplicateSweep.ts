/**
 * Scan pending queue for near-duplicate clusters; keep best, skip/delete weaker.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'
import { computeArticleSimilarity } from '@/services/newsroom/dedupe/similarityEngine'
import { normalizeTitleNorm } from '@/services/newsroom/dedupe/storyLibraryService'
import {
  AUTO_DROP_QUALITY_GAP,
  aiPickBetterQueueItem,
  compareQueueQuality,
  scoreFromArticleInput,
} from '@/services/newsroom/queue/queueQualityCompare'
import type { NewsQueueDocument } from '@/services/newsroom/queue/types'

/** Stricter than published-article dedupe — protect unique good news */
export const QUEUE_PEER_SIMILARITY = 0.62
/** Near-exact — safe auto-drop of weaker even with smaller quality gap */
export const QUEUE_PEER_STRONG_SIMILARITY = 0.78

const PEER_LOOKBACK_MS = 36 * 60 * 60 * 1000
const DEFAULT_SCAN_LIMIT = 350

export interface QueuePeerCandidate {
  id: string
  data: NewsQueueDocument
  title: string
  body: string
  qualityScore: number
}

export interface QueuePeerHit {
  peerQueueId: string
  peerTitle: string
  similarity: number
  reason: string
  /** This item should be dropped (weaker) */
  dropSelf: boolean
  /** Peer should be dropped (this item is better) */
  dropPeer: boolean
  /** Uncertain — flag for admin / AI editor review */
  needsReview: boolean
  qualityScore: number
  peerQualityScore: number
  decisionReason: string
}

function inputBody(data: NewsQueueDocument): string {
  const input = data.input
  return [input.originalSummary, input.originalContent].filter(Boolean).join(' ').slice(0, 800)
}

function toCandidate(id: string, data: NewsQueueDocument): QueuePeerCandidate {
  return {
    id,
    data,
    title: data.input.originalTitle ?? '',
    body: inputBody(data),
    qualityScore: scoreFromArticleInput(data.input),
  }
}

function sharedDistinctiveTokens(a: string, b: string): number {
  const stop = new Set(['ve', 'bir', 'bu', 'için', 'ile', 'haber', 'son', 'dakika'])
  const tok = (t: string) =>
    t
      .toLocaleLowerCase('tr-TR')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 3 && !stop.has(x))

  const setA = new Set(tok(a))
  let shared = 0
  for (const t of tok(b)) {
    if (setA.has(t)) shared += 1
  }
  return shared
}

/** Load recent pending/processing/failed queue peers for comparison. */
export async function loadRecentQueuePeers(
  db: Firestore,
  limit = 120,
  excludeId?: string
): Promise<QueuePeerCandidate[]> {
  const since = Date.now() - PEER_LOOKBACK_MS
  const statuses = ['pending', 'processing', 'failed'] as const
  const out: QueuePeerCandidate[] = []

  for (const status of statuses) {
    if (out.length >= limit) break
    try {
      const snap = await db
        .collection(Collections.NEWS_QUEUE)
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .limit(Math.min(80, limit - out.length + 10))
        .get()

      for (const doc of snap.docs) {
        if (excludeId && doc.id === excludeId) continue
        const data = doc.data() as NewsQueueDocument
        if ((data.createdAt ?? 0) < since) continue
        if (data.changeType === 'updated') continue
        out.push(toCandidate(doc.id, data))
        if (out.length >= limit) break
      }
    } catch (err) {
      console.warn(`[loadRecentQueuePeers] ${status} query failed:`, err)
    }
  }

  return out
}

export function findBestPeerAmong(
  self: QueuePeerCandidate,
  peers: QueuePeerCandidate[]
): { peer: QueuePeerCandidate; similarity: number } | null {
  const selfNorm = normalizeTitleNorm(self.title)
  let best: { peer: QueuePeerCandidate; similarity: number } | null = null

  for (const peer of peers) {
    if (peer.id === self.id) continue

    // Exact normalized title → definite peer
    const peerNorm = normalizeTitleNorm(peer.title)
    if (selfNorm && peerNorm && selfNorm === peerNorm) {
      return { peer, similarity: 1 }
    }

    // Same source URL → definite peer
    const urlA = self.data.input.sourceUrl?.trim()
    const urlB = peer.data.input.sourceUrl?.trim()
    if (urlA && urlB && urlA === urlB && urlA.startsWith('http')) {
      return { peer, similarity: 1 }
    }

    const shared = sharedDistinctiveTokens(self.title, peer.title)
    if (shared < 2) continue

    const similarity = computeArticleSimilarity(self.title, self.body, peer.title, peer.body)
    if (similarity < QUEUE_PEER_SIMILARITY) continue

    if (!best || similarity > best.similarity) {
      best = { peer, similarity }
    }
  }

  return best
}

export function decidePeerQuality(
  self: QueuePeerCandidate,
  peer: QueuePeerCandidate,
  similarity: number
): Omit<QueuePeerHit, 'peerQueueId' | 'peerTitle' | 'similarity' | 'reason'> {
  const cmp = compareQueueQuality(
    {
      title: self.title,
      summary: self.data.input.originalSummary,
      content: self.data.input.originalContent,
      imageUrl: self.data.input.imageUrl,
      sourceLabel: self.data.input.sourceLabel,
    },
    {
      title: peer.title,
      summary: peer.data.input.originalSummary,
      content: peer.data.input.originalContent,
      imageUrl: peer.data.input.imageUrl,
      sourceLabel: peer.data.input.sourceLabel,
    }
  )

  const strong = similarity >= QUEUE_PEER_STRONG_SIMILARITY
  const clearGap = cmp.gap >= AUTO_DROP_QUALITY_GAP

  // Strong match + clear winner → auto drop weaker
  if (strong || clearGap) {
    if (cmp.keep === 'a') {
      return {
        dropSelf: false,
        dropPeer: true,
        needsReview: false,
        qualityScore: cmp.scoreA,
        peerQualityScore: cmp.scoreB,
        decisionReason: cmp.reason,
      }
    }
    if (cmp.keep === 'b') {
      return {
        dropSelf: true,
        dropPeer: false,
        needsReview: false,
        qualityScore: cmp.scoreA,
        peerQualityScore: cmp.scoreB,
        decisionReason: cmp.reason,
      }
    }
  }

  // Borderline / tie → admin AI review, do not auto-delete unique-looking items
  return {
    dropSelf: false,
    dropPeer: false,
    needsReview: true,
    qualityScore: cmp.scoreA,
    peerQualityScore: cmp.scoreB,
    decisionReason: cmp.reason,
  }
}

export async function findQueuePeerDuplicate(
  db: Firestore,
  data: NewsQueueDocument,
  excludeId?: string
): Promise<QueuePeerHit | null> {
  if (data.changeType === 'updated') return null

  const peers = await loadRecentQueuePeers(db, 100, excludeId)
  const self = toCandidate(excludeId ?? 'self', data)
  const match = findBestPeerAmong(self, peers)
  if (!match) return null

  const decision = decidePeerQuality(self, match.peer, match.similarity)
  return {
    peerQueueId: match.peer.id,
    peerTitle: match.peer.title,
    similarity: match.similarity,
    reason: `queuePeer:${match.similarity.toFixed(2)}`,
    ...decision,
  }
}

export interface QueueDuplicateSweepStats {
  scanned: number
  clusters: number
  deleted: number
  skipped: number
  flagged: number
  kept: number
  deletedIds: string[]
  flaggedPairs: Array<{ keepId: string; weakId: string; similarity: number }>
}

/**
 * Cluster pending queue items and remove weaker duplicates.
 * Conservative: only deletes when similarity is strong or quality gap is clear.
 */
export async function sweepQueueDuplicates(
  db: Firestore,
  options: {
    limit?: number
    dryRun?: boolean
    /** Soft-delete via status=skipped instead of hard delete */
    softSkip?: boolean
    useAiForBorderline?: boolean
  } = {}
): Promise<QueueDuplicateSweepStats> {
  const limit = options.limit ?? DEFAULT_SCAN_LIMIT
  const dryRun = options.dryRun === true
  const softSkip = options.softSkip !== false

  const snap = await db
    .collection(Collections.NEWS_QUEUE)
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()

  const items = snap.docs.map((d) => toCandidate(d.id, d.data() as NewsQueueDocument))
  const used = new Set<string>()
  const stats: QueueDuplicateSweepStats = {
    scanned: items.length,
    clusters: 0,
    deleted: 0,
    skipped: 0,
    flagged: 0,
    kept: 0,
    deletedIds: [],
    flaggedPairs: [],
  }

  for (let i = 0; i < items.length; i++) {
    const a = items[i]!
    if (used.has(a.id)) continue

    const cluster: QueuePeerCandidate[] = [a]
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j]!
      if (used.has(b.id)) continue
      const hit = findBestPeerAmong(a, [b])
      if (hit) cluster.push(b)
    }

    if (cluster.length < 2) {
      stats.kept += 1
      continue
    }

    stats.clusters += 1

    // Rank by quality descending; first wins
    cluster.sort((x, y) => y.qualityScore - x.qualityScore)
    const winner = cluster[0]!
    used.add(winner.id)
    stats.kept += 1

    for (const loser of cluster.slice(1)) {
      used.add(loser.id)
      const similarity =
        findBestPeerAmong(winner, [loser])?.similarity ??
        computeArticleSimilarity(winner.title, winner.body, loser.title, loser.body)
      const decision = decidePeerQuality(winner, loser, similarity)

      let shouldDrop = decision.dropPeer // winner is "self" in decidePeerQuality(winner, loser) → dropPeer means drop loser
      // decidePeerQuality(self=winner, peer=loser): dropPeer=true means drop loser ✓
      // dropSelf=true would mean drop winner — shouldn't happen when winner has higher score
      if (decision.dropSelf && !decision.dropPeer) {
        // Winner somehow weaker after re-score — skip destructive action
        shouldDrop = false
      }

      if (!shouldDrop && decision.needsReview && options.useAiForBorderline) {
        const ai = await aiPickBetterQueueItem(
          {
            title: winner.title,
            summary: winner.data.input.originalSummary,
            content: winner.data.input.originalContent,
            imageUrl: winner.data.input.imageUrl,
          },
          {
            title: loser.title,
            summary: loser.data.input.originalSummary,
            content: loser.data.input.originalContent,
            imageUrl: loser.data.input.imageUrl,
          }
        )
        if (ai?.keep === 'a') shouldDrop = true
      }

      if (!shouldDrop) {
        stats.flagged += 1
        stats.flaggedPairs.push({
          keepId: winner.id,
          weakId: loser.id,
          similarity,
        })
        if (!dryRun) {
          await db.collection(Collections.NEWS_QUEUE).doc(loser.id).update({
            queueDuplicateSuspect: true,
            queueDuplicateOf: winner.id,
            queueDuplicateRole: 'weaker',
            queueDuplicateSimilarity: similarity,
            qualityScore: loser.qualityScore,
            peerQualityScore: winner.qualityScore,
            updatedAt: Date.now(),
          })
          await db.collection(Collections.NEWS_QUEUE).doc(winner.id).update({
            queueDuplicateSuspect: true,
            queueDuplicateRole: 'keeper',
            qualityScore: winner.qualityScore,
            updatedAt: Date.now(),
          })
        }
        continue
      }

      if (dryRun) {
        stats.deleted += 1
        stats.deletedIds.push(loser.id)
        continue
      }

      if (softSkip) {
        await db.collection(Collections.NEWS_QUEUE).doc(loser.id).update({
          status: 'skipped',
          lastError: `queuePeerDuplicate:weaker:${similarity.toFixed(2)}`.slice(0, 200),
          queueDuplicateSuspect: true,
          queueDuplicateOf: winner.id,
          queueDuplicateRole: 'weaker',
          queueDuplicateSimilarity: similarity,
          qualityScore: loser.qualityScore,
          peerQualityScore: winner.qualityScore,
          leaseOwner: null,
          leaseExpiresAt: null,
          claimedAt: null,
          updatedAt: Date.now(),
        })
        stats.skipped += 1
      } else {
        await db.collection(Collections.NEWS_QUEUE).doc(loser.id).delete()
        stats.deleted += 1
      }
      stats.deletedIds.push(loser.id)
    }
  }

  return stats
}
