import type { FeedCandidateRow } from '@/types/smartFeed'
import { freshnessScore, resolveCategoryClass } from '@/lib/feed/rankingConfig'

function repQualityScore(row: FeedCandidateRow, now = new Date()): number {
  const catClass = resolveCategoryClass(row.category, row.breaking)
  const fresh = freshnessScore(row.publishedAt, catClass, now)
  const media = row.image || row.video ? 0.15 : 0
  const verified = row.publisherVerified ? 0.1 : 0
  const tier = (row.sourceQualityTier ?? 'UNTESTED').toUpperCase()
  const tierBonus = tier === 'PREMIUM' ? 0.12 : tier === 'TRUSTED' ? 0.08 : 0
  const importance = Math.min(0.2, (row.clusterImportance ?? 0) / 500)
  const engagement = Math.min(0.1, (row.likesCount + row.commentsCount) / 200)
  return fresh * 0.4 + media + verified + tierBonus + importance + engagement
}

/** Pick best cluster representative by quality/freshness/media — not SQL order alone. */
export function selectClusterRepresentatives(rows: FeedCandidateRow[]): FeedCandidateRow[] {
  const byCluster = new Map<string, FeedCandidateRow[]>()
  const standalone: FeedCandidateRow[] = []

  for (const row of rows) {
    if (!row.clusterId) {
      standalone.push(row)
      continue
    }
    const list = byCluster.get(row.clusterId) ?? []
    list.push(row)
    byCluster.set(row.clusterId, list)
  }

  const reps: FeedCandidateRow[] = [...standalone]
  for (const clusterRows of byCluster.values()) {
    clusterRows.sort((a, b) => {
      const sa = repQualityScore(a)
      const sb = repQualityScore(b)
      if (sb !== sa) return sb - sa
      return b.publishedAt.getTime() - a.publishedAt.getTime()
    })
    reps.push(clusterRows[0])
  }

  return reps
}

export class FeedRepresentativeSelector {
  select(rows: FeedCandidateRow[]): FeedCandidateRow[] {
    return selectClusterRepresentatives(rows)
  }
}

export const feedRepresentativeSelector = new FeedRepresentativeSelector()
