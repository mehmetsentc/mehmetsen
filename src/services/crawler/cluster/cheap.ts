import { jaccardTokens } from '../duplicate/hash'
import { isNearDuplicateSimhash } from '../duplicate/engine'
import type { NewsClusterRecord, RawArticleRecord } from '../types'

const TIME_WINDOW_MS = 6 * 60 * 60 * 1000

export function clusterTopicFromTitle(title: string | null): string {
  return (title || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

export function findCheapClusterMatch(
  article: Pick<RawArticleRecord, 'title' | 'simhash' | 'publishedAt' | 'countryCode' | 'city'>,
  clusters: Array<NewsClusterRecord & { representativeTitle?: string | null; representativeSimhash?: string | null }>,
  now = new Date()
): NewsClusterRecord | null {
  const topic = clusterTopicFromTitle(article.title)
  const published = article.publishedAt?.getTime() ?? now.getTime()

  let best: { cluster: NewsClusterRecord; score: number } | null = null
  for (const cluster of clusters) {
    if (article.countryCode && cluster.countryCode && article.countryCode !== cluster.countryCode) {
      continue
    }
    const last = cluster.lastSeenAt.getTime()
    if (Math.abs(published - last) > TIME_WINDOW_MS) continue

    let score = 0
    if (topic && cluster.normalizedTopic) {
      score += jaccardTokens(topic, cluster.normalizedTopic)
    }
    if (isNearDuplicateSimhash(article.simhash, cluster.representativeSimhash || null)) {
      score += 0.35
    }
    if (article.city && cluster.city && article.city.toLowerCase() === cluster.city.toLowerCase()) {
      score += 0.1
    }
    if (score >= 0.55 && (!best || score > best.score)) {
      best = { cluster, score }
    }
  }
  return best?.cluster ?? null
}
