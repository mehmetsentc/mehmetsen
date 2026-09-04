/**
 * NFRank V1 — Feed V2–only ranking configuration.
 * Deterministic, non-AI. Centralized weights (no scattered magic numbers).
 */

export const NFRANK_VERSION = 'NFRANK_V1' as const

export type NfRankCategoryClass =
  | 'BREAKING'
  | 'SPORT'
  | 'GENERAL'
  | 'ECONOMY'
  | 'ANALYSIS'
  | 'CULTURE'

/** Initial priors — tunable, not scientific truth. */
export const NFRANK_CONFIG_V1 = {
  version: NFRANK_VERSION,
  /** Composition priors for personal feed (must sum ~1). */
  composition: {
    personalized: 0.7,
    freshImportant: 0.15,
    discovery: 0.1,
    exploration: 0.05,
  },
  baseWeights: {
    dwellIntent: 0.1,
    readIntent: 0.12,
    saveIntent: 0.1,
    shareIntent: 0.08,
    followIntent: 0.12,
    topicAffinity: 0.1,
    categoryAffinity: 0.08,
    publisherAffinity: 0.1,
    freshness: 0.14,
    localRelevance: 0.1,
    editorialImportance: 0.12,
    quality: 0.08,
    engagement: 0.06,
    discovery: 0.05,
    /** Soft boost for older eligible items with strong affinity (not a validity claim). */
    archiveRediscovery: 0.06,
    quickSkipPenalty: 0.12,
    explicitNegativePenalty: 0.22,
    clusterRepeatPenalty: 0.35,
    publisherSaturationPenalty: 0.18,
    categorySaturationPenalty: 0.14,
  },
  /** Half-life hours by category class (canonical publishedAt). */
  freshnessHalfLifeHours: {
    BREAKING: 4,
    SPORT: 8,
    GENERAL: 18,
    ECONOMY: 24,
    ANALYSIS: 48,
    CULTURE: 72,
  } as Record<NfRankCategoryClass, number>,
  /**
   * Archive rediscovery: only when age exceeds freshness half-life × this factor
   * AND affinity/quality justify resurfacing. Not a staleness classifier.
   */
  archiveRediscovery: {
    minAgeHalfLifeFactor: 2,
    maxContribution: 0.55,
    requireMinAffinity: 0.35,
  },
  diversity: {
    windowSize: 12,
    maxSamePublisherInWindow: 2,
    maxSameCategoryInWindow: 3,
    maxSameClusterInWindow: 1,
  },
  /** Stability window: do not reorder current + next N cards on session continue. */
  stabilityFrozenPrefix: 2,
  /** Single fast-skip bounded penalty (not permanent destroy). */
  singleQuickSkipPenalty: 0.08,
  repeatedQuickSkipPenalty: 0.18,
  /** Exploration must still pass eligibility (enforced upstream). */
  explorationMinQuality: 0.35,
} as const

export type NfRankConfigV1 = typeof NFRANK_CONFIG_V1

export function resolveNfRankCategoryClass(
  category: string | null | undefined,
  breaking: boolean
): NfRankCategoryClass {
  if (breaking) return 'BREAKING'
  const c = (category || '').toLowerCase()
  if (c.includes('spor')) return 'SPORT'
  if (c.includes('ekonomi') || c.includes('finans')) return 'ECONOMY'
  if (c.includes('kultur') || c.includes('sanat') || c.includes('magazin')) return 'CULTURE'
  if (c.includes('analiz') || c.includes('yorum')) return 'ANALYSIS'
  if (c.includes('son-dakika') || c.includes('gundem')) return 'BREAKING'
  return 'GENERAL'
}

export function nfRankFreshnessScore(
  publishedAt: Date,
  category: string | null | undefined,
  breaking: boolean,
  nowMs: number = Date.now()
): number {
  const cls = resolveNfRankCategoryClass(category, breaking)
  const halfLife = NFRANK_CONFIG_V1.freshnessHalfLifeHours[cls]
  const ageHours = Math.max(0, (nowMs - publishedAt.getTime()) / 3_600_000)
  return Math.pow(0.5, ageHours / halfLife)
}

/** Conservative archive rediscovery feature (0..1). Validity/staleness metadata is MISSING — age decay only. */
export function nfRankArchiveRediscoveryScore(input: {
  publishedAt: Date
  category: string | null | undefined
  breaking: boolean
  categoryAffinity: number
  publisherAffinity: number
  quality: number
  nowMs?: number
}): number {
  const cfg = NFRANK_CONFIG_V1.archiveRediscovery
  const cls = resolveNfRankCategoryClass(input.category, input.breaking)
  const halfLife = NFRANK_CONFIG_V1.freshnessHalfLifeHours[cls]
  const nowMs = input.nowMs ?? Date.now()
  const ageHours = Math.max(0, (nowMs - input.publishedAt.getTime()) / 3_600_000)
  if (ageHours < halfLife * cfg.minAgeHalfLifeFactor) return 0
  // Breaking / high-tempo classes: do not rediscover as archive without validity fields.
  if (cls === 'BREAKING' || input.breaking) return 0
  const affinity = Math.max(input.categoryAffinity, input.publisherAffinity * 0.85)
  if (affinity < cfg.requireMinAffinity) return 0
  const ageDecay = Math.pow(0.5, ageHours / (halfLife * 6))
  const raw = affinity * 0.55 + input.quality * 0.25 + ageDecay * 0.2
  return Math.min(cfg.maxContribution, Math.max(0, raw))
}
