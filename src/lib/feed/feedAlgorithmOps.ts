/**
 * Runtime algorithm ops — admin-controlled, no deploy required.
 * Feed V2 NFRank live switch + editorial instructions + topic boosts.
 */

export const FEED_ALGORITHM_OPS_DOC_ID = 'global'
export const FEED_ALGORITHM_OPS_CACHE_MS = 10_000
export const FEED_ALGORITHM_INSTRUCTIONS_MAX = 4_000
export const FEED_ALGORITHM_TOPIC_MAX = 24
export const FEED_ALGORITHM_TOPIC_LEN = 40

export interface FeedAlgorithmOps {
  liveEnabled: boolean
  instructions: string
  boostTopics: string[]
  updatedAt: number | null
  updatedBy: string | null
}

export function defaultFeedAlgorithmOps(liveEnabled = false): FeedAlgorithmOps {
  return {
    liveEnabled,
    instructions: '',
    boostTopics: [],
    updatedAt: null,
    updatedBy: null,
  }
}

export function normalizeBoostTopic(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (t.length < 2 || t.length > FEED_ALGORITHM_TOPIC_LEN) return null
  if (!/^[\p{L}\p{N} #._-]+$/u.test(t)) return null
  return t.replace(/^#/, '')
}

export function sanitizeFeedAlgorithmOps(
  raw: Partial<FeedAlgorithmOps> | null | undefined,
  liveFallback = false
): FeedAlgorithmOps {
  const defaults = defaultFeedAlgorithmOps(liveFallback)
  const topics: string[] = []
  const seen = new Set<string>()
  const incoming = Array.isArray(raw?.boostTopics) ? raw.boostTopics : defaults.boostTopics
  for (const item of incoming) {
    const n = normalizeBoostTopic(item)
    if (!n || seen.has(n)) continue
    seen.add(n)
    topics.push(n)
    if (topics.length >= FEED_ALGORITHM_TOPIC_MAX) break
  }

  const instructions =
    typeof raw?.instructions === 'string'
      ? raw.instructions.trim().slice(0, FEED_ALGORITHM_INSTRUCTIONS_MAX)
      : defaults.instructions

  return {
    liveEnabled: typeof raw?.liveEnabled === 'boolean' ? raw.liveEnabled : defaults.liveEnabled,
    instructions,
    boostTopics: topics,
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : defaults.updatedAt,
    updatedBy: typeof raw?.updatedBy === 'string' ? raw.updatedBy : defaults.updatedBy,
  }
}
