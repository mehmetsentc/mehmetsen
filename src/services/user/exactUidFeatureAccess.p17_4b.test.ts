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

describe('PHASE P17.4B — Exact Firebase UID Feature Access Resolution & Cohort Containment', () => {
  const origEnv = { ...process.env }
  const CANONICAL_PILOT_UID = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'
  const HISTORICAL_PILOT_UID = 'ap3scBglLIVwflfZN4qL8PKrM1A3'

  // Malformed / OCR / permutation variants that must NEVER match canonical UID
  const OCR_PERMUTATIONS = [
    'wG8WTNIW38TILLvpDLsFmt6lMIg1', // 'I' instead of 'l', '6' instead of '8'
    'wG8WTNIW38TILLvpDLsFmt61M1g1',
    'wG8WTNlW38TILLvpDLsFmt61M1g1',
    'wG8WTNlW38TILLvpDLsFmt81M1g1',
    'wG8WTNlW38TILLvpDLsFmt8IM1g1',
    'wG8WTNlW38TILLvpDLsFmt8lMlg1',
    'wG8WTNlW38TILLvpDLsFmt8IMlgI',
    'wg8wtnlw38tillvpdlsfmt8imlg1', // lowercase variant
    'WG8WTNLW38TILLVPDLSFMT8IMLG1', // uppercase variant
    ' wG8WTNlW38TILLvpDLsFmt8IMlg1', // leading space
    'wG8WTNlW38TILLvpDLsFmt8IMlg1 ', // trailing space
  ]

  beforeEach(() => {
    process.env = { ...origEnv }
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.USER_PROFILES_ENABLED = 'false'
    process.env.SOCIAL_GRAPH_ENABLED = 'false'
    process.env.SMART_FEED_ENABLED = 'false'
    process.env.SMART_FEED_RANKING_V1_ENABLED = 'false'
    process.env.COLD_START_V2_ENABLED = 'false'
    process.env.SMART_FEED_VIDEO_ENABLED = 'false'
    process.env.SMART_FEED_TELEMETRY_ENABLED = 'false'

    // Mock repo: ONLY canonical pilot UID has active grants in DB (single pilot invariant)
    vi.spyOn(userFeatureAccessRepository, 'listEnabledKeys').mockImplementation(async (userId: string) => {
      // Strict exact opaque string equality check
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
  })

  afterEach(() => {
    process.env = { ...origEnv }
    vi.restoreAllMocks()
  })

  describe('1. Global Flags Invariant', () => {
    it('ensures all consumer flags default to FALSE globally in production', () => {
      for (const feat of USER_ALLOWLISTABLE_FEATURES) {
        expect(isGlobalUserFeatureEnabled(feat)).toBe(false)
      }
    })
  })

  describe('2. Exact UID Matching & Single Pilot Containment', () => {
    it('resolves all 7 features to true strictly for the exact canonical pilot UID', async () => {
      expect(await isSmartFeedEffectiveForUser(CANONICAL_PILOT_UID)).toBe(true)
      expect(await isSmartFeedRankingEffectiveForUser(CANONICAL_PILOT_UID)).toBe(true)
      expect(await isSocialGraphEffectiveForUser(CANONICAL_PILOT_UID)).toBe(true)
      expect(await isUserProfilesEffectiveForUser(CANONICAL_PILOT_UID)).toBe(true)
      expect(await isColdStartEffectiveForUser(CANONICAL_PILOT_UID)).toBe(true)
      expect(await isSmartFeedVideoEffectiveForUser(CANONICAL_PILOT_UID)).toBe(true)
      expect(await isSmartFeedTelemetryEffectiveForUser(CANONICAL_PILOT_UID)).toBe(true)

      for (const feat of USER_ALLOWLISTABLE_FEATURES) {
        expect(await isFeatureEnabledForUser(CANONICAL_PILOT_UID, feat)).toBe(true)
      }
    })

    it('ensures historical pilot user UID has 0 override grants and falls back to global flag state', async () => {
      // With global flags off:
      expect(await isSmartFeedEffectiveForUser(HISTORICAL_PILOT_UID)).toBe(false)
      expect(await isSmartFeedRankingEffectiveForUser(HISTORICAL_PILOT_UID)).toBe(false)
      expect(await isSocialGraphEffectiveForUser(HISTORICAL_PILOT_UID)).toBe(false)
      expect(await isUserProfilesEffectiveForUser(HISTORICAL_PILOT_UID)).toBe(false)
      expect(await isColdStartEffectiveForUser(HISTORICAL_PILOT_UID)).toBe(false)
      expect(await isSmartFeedVideoEffectiveForUser(HISTORICAL_PILOT_UID)).toBe(false)
      expect(await isSmartFeedTelemetryEffectiveForUser(HISTORICAL_PILOT_UID)).toBe(false)

      for (const feat of USER_ALLOWLISTABLE_FEATURES) {
        expect(await isFeatureEnabledForUser(HISTORICAL_PILOT_UID, feat)).toBe(false)
      }
    })
  })

  describe('3. Strict Isolation: Rejection of OCR Variations, Permutations & Transmutations', () => {
    it('denies feature access to all OCR permutations and character substitutions', async () => {
      for (const permUid of OCR_PERMUTATIONS) {
        const smartFeed = await isSmartFeedEffectiveForUser(permUid)
        const socialGraph = await isSocialGraphEffectiveForUser(permUid)
        const userProfiles = await isUserProfilesEffectiveForUser(permUid)

        expect(smartFeed, `Expected ${permUid} to have SMART_FEED disabled`).toBe(false)
        expect(socialGraph, `Expected ${permUid} to have SOCIAL_GRAPH disabled`).toBe(false)
        expect(userProfiles, `Expected ${permUid} to have USER_PROFILES disabled`).toBe(false)

        for (const feat of USER_ALLOWLISTABLE_FEATURES) {
          const enabled = await isFeatureEnabledForUser(permUid, feat)
          expect(enabled, `Expected ${permUid} to have ${feat} disabled`).toBe(false)
        }
      }
    })
  })

  describe('4. Strict Isolation: Non-Allowlisted Users & Anonymous', () => {
    it('denies feature access to random registered user UIDs', async () => {
      const randomUids = [
        '2xBSzTUIcJW1VJcppsmRfT3aBC63',
        '4ufcTi9XFkYjGXIfNcTLnZHy7u93',
        '6rTUee5f4bdrlrv8kmWjMWAVUWe2',
        'random_user_abc123',
      ]
      for (const uid of randomUids) {
        expect(await isSmartFeedEffectiveForUser(uid)).toBe(false)
        expect(await isSocialGraphEffectiveForUser(uid)).toBe(false)
      }
    })

    it('denies feature access to anonymous or missing user IDs', async () => {
      expect(await isSmartFeedEffectiveForUser(null)).toBe(false)
      expect(await isSmartFeedEffectiveForUser(undefined)).toBe(false)
      expect(await isSmartFeedEffectiveForUser('')).toBe(false)
      expect(await isSocialGraphEffectiveForUser(null)).toBe(false)
      expect(await isSocialGraphEffectiveForUser(undefined)).toBe(false)
      expect(await isSocialGraphEffectiveForUser('')).toBe(false)
    })
  })
})
