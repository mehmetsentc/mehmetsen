import type { FeedCandidateRow, FeedCandidateSource, FeedMode } from '@/types/smartFeed'
import { FEED_MIX_V1 } from '@/lib/feed/config'
import { compareFeedRows } from './feedUtils'

/** Cluster-level dedup: one representative per cluster in final feed. */
export function dedupeByCluster(rows: FeedCandidateRow[]): FeedCandidateRow[] {
  const seenClusters = new Set<string>()
  const seenArticles = new Set<string>()
  const out: FeedCandidateRow[] = []

  for (const row of rows) {
    if (seenArticles.has(row.articleId)) continue
    if (row.clusterId) {
      if (seenClusters.has(row.clusterId)) continue
      seenClusters.add(row.clusterId)
    }
    seenArticles.add(row.articleId)
    out.push(row)
  }
  return out
}

/** Deterministic interleave for "Sana Özel" baseline. */
export function mixPersonalFeed(
  pools: Partial<Record<FeedCandidateSource, FeedCandidateRow[]>>,
  limit: number,
  hasFollowing: boolean
): FeedCandidateRow[] {
  const iterators: Record<string, number> = {}
  const picked: FeedCandidateRow[] = []
  const usedArticles = new Set<string>()
  const usedClusters = new Set<string>()

  const canTake = (row: FeedCandidateRow): boolean => {
    if (usedArticles.has(row.articleId)) return false
    if (row.clusterId && usedClusters.has(row.clusterId)) return false
    return true
  }

  const take = (row: FeedCandidateRow) => {
    usedArticles.add(row.articleId)
    if (row.clusterId) usedClusters.add(row.clusterId)
    picked.push(row)
  }

  let guard = 0
  while (picked.length < limit && guard < limit * FEED_MIX_V1.length * 3) {
    guard++
    for (const slot of FEED_MIX_V1) {
      if (slot.source === 'FOLLOWING' && !hasFollowing) continue
      const pool = pools[slot.source] ?? []
      const idx = iterators[slot.source] ?? 0
      iterators[slot.source] = idx + 1
      const candidate = pool[idx]
      if (candidate && canTake(candidate)) take(candidate)
      if (picked.length >= limit) break
    }
  }

  // Fill remainder from RECENT pool
  if (picked.length < limit) {
    for (const row of pools.RECENT ?? []) {
      if (picked.length >= limit) break
      if (canTake(row)) take(row)
    }
  }

  picked.sort(compareFeedRows)
  return picked.slice(0, limit)
}

export function rankModeFeed(mode: FeedMode, rows: FeedCandidateRow[], limit: number): FeedCandidateRow[] {
  const deduped = dedupeByCluster(rows)
  deduped.sort(compareFeedRows)
  return deduped.slice(0, limit)
}

export class FeedRankingV1 {
  rankPersonal(
    pools: Partial<Record<FeedCandidateSource, FeedCandidateRow[]>>,
    limit: number,
    hasFollowing: boolean
  ): FeedCandidateRow[] {
    return mixPersonalFeed(pools, limit, hasFollowing)
  }

  rankMode(mode: FeedMode, rows: FeedCandidateRow[], limit: number): FeedCandidateRow[] {
    return rankModeFeed(mode, rows, limit)
  }
}

export const feedRankingV1 = new FeedRankingV1()
