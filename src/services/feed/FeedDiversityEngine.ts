import type { FeedMode, ScoredFeedCandidate } from '@/types/smartFeed'
import { FEED_RANKING_CONFIG_V1 } from '@/lib/feed/rankingConfig'

export class FeedDiversityEngine {
  rerank(
    scored: ScoredFeedCandidate[],
    mode: FeedMode,
    limit: number,
    windowSize = FEED_RANKING_CONFIG_V1.diversityWindowSize
  ): ScoredFeedCandidate[] {
    const pool = [...scored]
    const picked: ScoredFeedCandidate[] = []
    const usedArticles = new Set<string>()
    const usedClusters = new Set<string>()

    const publisherWindow: string[] = []
    const categoryWindow: string[] = []

    while (picked.length < limit && pool.length) {
      let bestIdx = -1
      let bestAdj = -Infinity

      for (let i = 0; i < pool.length; i++) {
        const row = pool[i]
        if (usedArticles.has(row.articleId)) continue
        if (row.clusterId && usedClusters.has(row.clusterId)) continue

        let adj = row.score
        const pub = row.publisherId ?? '_unknown'
        const cat = (row.category ?? '_general').toLowerCase()

        const pubRepeats = publisherWindow.filter((p) => p === pub).length
        const catRepeats = categoryWindow.filter((c) => c === cat).length
        adj -= pubRepeats * 0.08 * FEED_RANKING_CONFIG_V1.baseWeights.diversityPenalty
        adj -= catRepeats * 0.05 * FEED_RANKING_CONFIG_V1.baseWeights.diversityPenalty

        if (mode === 'personal' && row.source === 'DISCOVERY') {
          adj += FEED_RANKING_CONFIG_V1.explorationRatioPersonal * 0.05
        }

        if (adj > bestAdj) {
          bestAdj = adj
          bestIdx = i
        }
      }

      if (bestIdx < 0) break
      const chosen = pool.splice(bestIdx, 1)[0]
      picked.push(chosen)
      usedArticles.add(chosen.articleId)
      if (chosen.clusterId) usedClusters.add(chosen.clusterId)

      publisherWindow.push(chosen.publisherId ?? '_unknown')
      categoryWindow.push((chosen.category ?? '_general').toLowerCase())
      if (publisherWindow.length > windowSize) publisherWindow.shift()
      if (categoryWindow.length > windowSize) categoryWindow.shift()
    }

    return picked
  }
}

export const feedDiversityEngine = new FeedDiversityEngine()
