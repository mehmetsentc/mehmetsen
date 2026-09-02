import type { FeedCandidateSource, FeedMode } from '@/types/smartFeed'

/** IntersectionObserver impression gate — central config. */
export const FEED_IMPRESSION_CONFIG = {
  visibilityRatio: 0.6,
  minVisibleMs: 750,
} as const

export const FEED_PAGINATION = {
  defaultLimit: 15,
  minLimit: 10,
  maxLimit: 30,
  /** Prefetch when this many cards remain ahead of the active index. */
  prefetchThreshold: 5,
} as const

/** Deterministic "Sana Özel" mix — no AI/ML. */
export const FEED_MIX_V1: Array<{ source: FeedCandidateSource; every: number }> = [
  { source: 'BREAKING', every: 5 },
  { source: 'RECENT', every: 2 },
  { source: 'POPULAR', every: 4 },
  { source: 'LOCAL', every: 3 },
  { source: 'DISCOVERY', every: 6 },
  { source: 'FOLLOWING', every: 4 },
]

export const FEED_MODE_LABELS: Record<FeedMode, string> = {
  personal: 'Sana Özel',
  following: 'Takip',
  breaking: 'Son Dakika',
  local: 'Yerel',
}

/** Guest sessionStorage bound for seen articles (not millions of DB writes). */
export const GUEST_SEEN_STORAGE_KEY = 'nahaber_feed_seen_v1'
export const GUEST_SEEN_MAX = 120

/** Feed position restoration after article detail. */
export const FEED_RESTORE_STORAGE_KEY = 'nahaber_feed_restore_v1'
