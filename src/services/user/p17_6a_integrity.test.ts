import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isGlobalUserFeatureEnabled,
  resolveFeatureForUser,
  USER_ALLOWLISTABLE_FEATURES,
} from '@/lib/user/userRolloutMatrix'
import {
  isFeatureEnabledForUser,
  isSmartFeedEffectiveForUser,
  isSmartFeedRankingEffectiveForUser,
  isSocialGraphEffectiveForUser,
  isUserProfilesEffectiveForUser,
  isColdStartEffectiveForUser,
  isSmartFeedVideoEffectiveForUser,
  isSmartFeedTelemetryEffectiveForUser,
} from '@/lib/user/effectiveUserFlags'
import { userFeatureAccessRepository } from '@/services/user/userFeatureAccessRepository'
import { FEED_RANKING_CONFIG_V1 } from '@/lib/feed/rankingConfig'

describe('PHASE P17.6A — Global Feed Integrity Closeout Regression Tests', () => {
  const origEnv = { ...process.env }
  const CANONICAL_PILOT_UID = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'
  const HISTORICAL_PILOT_UID = 'ap3scBglLIVwflfZN4qL8PKrM1A3'

  beforeEach(() => {
    process.env = { ...origEnv }
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
  })

  afterEach(() => {
    process.env = { ...origEnv }
    vi.restoreAllMocks()
  })

  describe('1. Global Enablement & Anonymous Access Invariant', () => {
    it('allows anonymous/unauthenticated users when global consumer flags are enabled', async () => {
      process.env.SMART_FEED_ENABLED = 'true'
      process.env.SMART_FEED_RANKING_V1_ENABLED = 'true'
      process.env.SOCIAL_GRAPH_ENABLED = 'true'
      process.env.USER_PROFILES_ENABLED = 'true'
      process.env.COLD_START_V2_ENABLED = 'true'
      process.env.SMART_FEED_VIDEO_ENABLED = 'true'
      process.env.SMART_FEED_TELEMETRY_ENABLED = 'true'

      expect(await isSmartFeedEffectiveForUser(null)).toBe(true)
      expect(await isSmartFeedRankingEffectiveForUser(null)).toBe(true)
      expect(await isSocialGraphEffectiveForUser(null)).toBe(true)
      expect(await isUserProfilesEffectiveForUser(null)).toBe(true)
      expect(await isColdStartEffectiveForUser(null)).toBe(true)
      expect(await isSmartFeedVideoEffectiveForUser(null)).toBe(true)
      expect(await isSmartFeedTelemetryEffectiveForUser(null)).toBe(true)
    })
  })

  describe('2. Single Pilot Override Containment Invariant', () => {
    it('ensures only canonical operator UID retains override grants in DB, historical pilot has 0 overrides', async () => {
      process.env.SMART_FEED_ENABLED = 'false'
      process.env.SMART_FEED_RANKING_V1_ENABLED = 'false'
      process.env.SOCIAL_GRAPH_ENABLED = 'false'
      process.env.USER_PROFILES_ENABLED = 'false'
      process.env.COLD_START_V2_ENABLED = 'false'
      process.env.SMART_FEED_VIDEO_ENABLED = 'false'
      process.env.SMART_FEED_TELEMETRY_ENABLED = 'false'

      // Mock DB: Only canonical operator has active override rows
      vi.spyOn(userFeatureAccessRepository, 'listEnabledKeys').mockImplementation(async (userId: string) => {
        if (userId === CANONICAL_PILOT_UID) {
          return new Set([
            'USER_PROFILES',
            'SOCIAL_GRAPH',
            'SMART_FEED',
            'SMART_FEED_RANKING_V1',
            'COLD_START_V2',
            'SMART_FEED_VIDEO',
            'SMART_FEED_TELEMETRY',
          ])
        }
        return new Set()
      })

      // Canonical operator retains access via override
      expect(await isSmartFeedEffectiveForUser(CANONICAL_PILOT_UID)).toBe(true)
      expect(await isSmartFeedRankingEffectiveForUser(CANONICAL_PILOT_UID)).toBe(true)

      // Historical pilot has 0 overrides, so with global flags OFF it evaluates to false
      expect(await isSmartFeedEffectiveForUser(HISTORICAL_PILOT_UID)).toBe(false)
      expect(await isSmartFeedRankingEffectiveForUser(HISTORICAL_PILOT_UID)).toBe(false)
      expect(await isSocialGraphEffectiveForUser(HISTORICAL_PILOT_UID)).toBe(false)
    })
  })

  describe('3. Ranking & Diversity Configuration Invariants', () => {
    it('guarantees diversity window size is 8 and freshness half lives are configured', () => {
      expect(FEED_RANKING_CONFIG_V1.diversityWindowSize).toBe(8)
      expect(FEED_RANKING_CONFIG_V1.freshnessHalfLifeHours.BREAKING).toBe(4)
      expect(FEED_RANKING_CONFIG_V1.freshnessHalfLifeHours.SPORT).toBe(8)
      expect(FEED_RANKING_CONFIG_V1.freshnessHalfLifeHours.GENERAL).toBe(24)
      expect(FEED_RANKING_CONFIG_V1.freshnessHalfLifeHours.ANALYSIS).toBe(72)
      expect(FEED_RANKING_CONFIG_V1.freshnessHalfLifeHours.CULTURE).toBe(96)
      expect(FEED_RANKING_CONFIG_V1.materialUpdateBoost).toBe(0.18)
    })
  })
})
