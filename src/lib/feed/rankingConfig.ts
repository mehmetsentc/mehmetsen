import type { FeedCandidateSource, FeedMode } from '@/types/smartFeed'

export const FEED_RANKING_VERSION = 'v1' as const

export type InterestScoreSource = 'EXPLICIT' | 'BEHAVIORAL'
export type FeedCategoryClass = 'BREAKING' | 'SPORT' | 'GENERAL' | 'ANALYSIS' | 'CULTURE'
export type BehavioralSignal =
  | 'FOLLOW'
  | 'SAVE'
  | 'SHARE'
  | 'ARTICLE_OPEN'
  | 'LONG_DWELL'
  | 'COMMENT'
  | 'LIKE'
  | 'QUICK_SKIP'

export interface FeedSignalWeights {
  following: number
  freshness: number
  interest: number
  local: number
  editorial: number
  quality: number
  engagement: number
  discovery: number
  diversityPenalty: number
  seenPenalty: number
  negativeFeedbackPenalty: number
}

export interface FeedRankingConfigV1 {
  version: typeof FEED_RANKING_VERSION
  baseWeights: FeedSignalWeights
  modeProfiles: Record<FeedMode, Partial<FeedSignalWeights>>
  freshnessHalfLifeHours: Record<FeedCategoryClass, number>
  behavioralSignalWeights: Record<BehavioralSignal, number>
  dwellBucketNormalization: Record<string, number>
  candidatePoolLimits: Record<FeedCandidateSource, number>
  diversityWindowSize: number
  explorationRatioPersonal: number
  behavioralDecayDays: number
  behavioralLookbackDays: number
  materialUpdateBoost: number
  /** Additive featured/editor-pick boost (freshness-gated). */
  featuredBoost: number
  /** Half-life for featured priority decay (hours). */
  featuredHalfLifeHours: number
  /** Additive time-decayed popularity boost for personal mix. */
  popularityBoost: number
  /** Views coefficient inside popularity raw (likes remain ×3). */
  popularityViewWeight: number
  engagementNormCap: number
  popularityNormCap: number
}

const BASE_WEIGHTS: FeedSignalWeights = {
  following: 0.18,
  freshness: 0.16,
  interest: 0.14,
  local: 0.1,
  editorial: 0.12,
  quality: 0.08,
  engagement: 0.1,
  discovery: 0.06,
  diversityPenalty: 0.12,
  seenPenalty: 0.15,
  negativeFeedbackPenalty: 0.2,
}

export const FEED_RANKING_CONFIG_V1: FeedRankingConfigV1 = {
  version: FEED_RANKING_VERSION,
  baseWeights: BASE_WEIGHTS,
  modeProfiles: {
    personal: {
      interest: 1.25,
      discovery: 1.3,
      following: 1.1,
      local: 1.05,
      // Elevate real popularity/most-read signals without overriding freshness/interest.
      engagement: 1.35,
      freshness: 1.1,
    },
    following: {
      following: 2.5,
      freshness: 1.4,
      discovery: 0.3,
      interest: 0.8,
    },
    breaking: {
      editorial: 2.0,
      freshness: 2.2,
      following: 0.6,
      discovery: 0.4,
      interest: 0.7,
    },
    local: {
      local: 2.5,
      freshness: 1.2,
      following: 0.9,
      discovery: 0.5,
    },
  },
  freshnessHalfLifeHours: {
    BREAKING: 4,
    SPORT: 8,
    GENERAL: 24,
    ANALYSIS: 72,
    CULTURE: 96,
  },
  behavioralSignalWeights: {
    FOLLOW: 1.0,
    SAVE: 0.85,
    SHARE: 0.75,
    ARTICLE_OPEN: 0.35,
    LONG_DWELL: 0.55,
    COMMENT: 0.65,
    LIKE: 0.45,
    QUICK_SKIP: -0.6,
  },
  dwellBucketNormalization: {
    under_3s: 0.05,
    '3_10s': 0.25,
    '10_30s': 0.55,
    '30_60s': 0.75,
    over_60s: 1.0,
  },
  candidatePoolLimits: {
    FOLLOWING: 80,
    BREAKING: 80,
    LOCAL: 80,
    RECENT: 150,
    POPULAR: 100,
    DISCOVERY: 80,
    FEATURED: 60,
  },
  diversityWindowSize: 8,
  explorationRatioPersonal: 0.12,
  behavioralDecayDays: 60,
  behavioralLookbackDays: 60,
  materialUpdateBoost: 0.18,
  featuredBoost: 0.32,
  featuredHalfLifeHours: 18,
  popularityBoost: 0.22,
  popularityViewWeight: 0.2,
  engagementNormCap: 100,
  popularityNormCap: 250,
}

const SPORT_CATEGORIES = new Set([
  'spor',
  'futbol',
  'basketbol',
  'tenis',
  'oyun-espor',
  'voleybol',
  'motor-sporlari',
])

const ANALYSIS_CATEGORIES = new Set([
  'ekonomi',
  'finans-piyasa',
  'siyaset',
  'politika',
  'bilim',
  'enerji',
  'finans',
  'borsa',
  'kripto',
  'teknoloji',
  'yazilim',
  'yapay-zeka',
])

const CULTURE_CATEGORIES = new Set([
  'kultur',
  'kultur-sanat',
  'sanat',
  'sinema',
  'kitap',
  'muzik',
  'magazin',
  'eglence',
  'gastronomi',
  'moda',
  'tarih',
  'yasam',
  'saglik',
  'otomotiv',
  'egitim',
])

const BREAKING_CATEGORIES = new Set([
  'son-dakika',
  'gundem',
  'asayis',
  'dunya',
])

export function resolveCategoryClass(category: string | null, breaking: boolean): FeedCategoryClass {
  const cat = (category ?? '').trim().toLowerCase()
  if (breaking || BREAKING_CATEGORIES.has(cat)) return 'BREAKING'
  if (SPORT_CATEGORIES.has(cat)) return 'SPORT'
  if (ANALYSIS_CATEGORIES.has(cat)) return 'ANALYSIS'
  if (CULTURE_CATEGORIES.has(cat)) return 'CULTURE'
  return 'GENERAL'
}

export function resolveModeWeights(mode: FeedMode): FeedSignalWeights {
  const profile = FEED_RANKING_CONFIG_V1.modeProfiles[mode] ?? {}
  const merged = { ...FEED_RANKING_CONFIG_V1.baseWeights }
  for (const key of Object.keys(profile) as Array<keyof FeedSignalWeights>) {
    const mult = profile[key]
    if (mult != null && merged[key] != null) merged[key] = merged[key] * mult
  }
  return merged
}

export function normalizeEngagementRate(raw: number, cap = FEED_RANKING_CONFIG_V1.engagementNormCap): number {
  if (raw <= 0) return 0
  return Math.min(1, Math.log1p(raw) / Math.log1p(cap))
}

export function freshnessScore(publishedAt: Date, categoryClass: FeedCategoryClass, now = new Date()): number {
  const halfLifeH = FEED_RANKING_CONFIG_V1.freshnessHalfLifeHours[categoryClass]
  const ageHours = Math.max(0, (now.getTime() - publishedAt.getTime()) / 3_600_000)
  return Math.pow(0.5, ageHours / halfLifeH)
}

/** Featured pin decay — week-old pins must not dominate forever. */
export function featuredFreshnessScore(publishedAt: Date, now = new Date()): number {
  const halfLifeH = FEED_RANKING_CONFIG_V1.featuredHalfLifeHours
  const ageHours = Math.max(0, (now.getTime() - publishedAt.getTime()) / 3_600_000)
  return Math.pow(0.5, ageHours / halfLifeH)
}

/**
 * Time-decayed popularity from real counters.
 * Formula: normalize(likes×3 + comments×2 + saves×2.5 + shares×2 + views×viewWeight)
 *          × freshness(GENERAL half-life)
 * Views use news.views_count (canonical). Not impressions/telemetry.
 */
export function viewPopularityScore(input: {
  viewsCount?: number | null
  likesCount?: number | null
  commentsCount?: number | null
  savesCount?: number | null
  sharesCount?: number | null
  publishedAt: Date
  now?: Date
}): number {
  const raw =
    (input.likesCount ?? 0) * 3 +
    (input.commentsCount ?? 0) * 2 +
    (input.savesCount ?? 0) * 2.5 +
    (input.sharesCount ?? 0) * 2 +
    (input.viewsCount ?? 0) * FEED_RANKING_CONFIG_V1.popularityViewWeight
  const normalized = normalizeEngagementRate(raw, FEED_RANKING_CONFIG_V1.popularityNormCap)
  const decay = freshnessScore(input.publishedAt, 'GENERAL', input.now)
  return Math.min(1, normalized * decay)
}
