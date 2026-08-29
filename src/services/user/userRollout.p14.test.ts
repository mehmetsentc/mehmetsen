import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  USER_FEATURE_DEPENDENCIES,
  USER_ALLOWLISTABLE_FEATURES,
  userDependencyClosure,
  resolveFeatureForUser,
  validateUserAllowlistGrant,
  isGlobalUserFeatureEnabled,
} from '@/lib/user/userRolloutMatrix'
import type { UserRolloutFeatureKey } from '@/types/userRollout'
import { UserFeatureAccessService } from '@/services/user/userFeatureAccessService'
import type { UserFeatureAccessRepository } from '@/services/user/userFeatureAccessRepository'
import { feedSessionService } from '@/services/feed/FeedSessionService'
import { feedScoringService } from '@/services/feed/FeedScoringService'
import { feedDiversityEngine } from '@/services/feed/FeedDiversityEngine'
import { feedRepresentativeSelector } from '@/services/feed/FeedRepresentativeSelector'
import { feedColdStartService } from '@/services/feed/FeedColdStartService'
import type { FeedCandidateRow, FeedUserContext } from '@/types/smartFeed'

class InMemoryUserFeatureAccessRepo implements Partial<UserFeatureAccessRepository> {
  private store = new Map<string, { userId: string; featureKey: UserRolloutFeatureKey; enabled: boolean }>()

  async listForUser(userId: string) {
    const list = []
    for (const v of this.store.values()) {
      if (v.userId === userId) {
        list.push({
          id: `ufa_${v.featureKey}`,
          userId: v.userId,
          featureKey: v.featureKey,
          enabled: v.enabled,
          createdAt: new Date(),
          createdBy: 'test-admin',
          updatedAt: new Date(),
          updatedBy: null,
          reason: 'test grant',
        })
      }
    }
    return list as any
  }

  async listEnabledKeys(userId: string): Promise<Set<string>> {
    const keys = new Set<string>()
    for (const v of this.store.values()) {
      if (v.userId === userId && v.enabled) {
        keys.add(v.featureKey)
      }
    }
    return keys
  }

  async countEnabledByFeature() {
    const counts: Record<string, number> = {}
    for (const v of this.store.values()) {
      if (v.enabled) {
        counts[v.featureKey] = (counts[v.featureKey] || 0) + 1
      }
    }
    return Object.entries(counts).map(([featureKey, count]) => ({ featureKey, count }))
  }

  async upsert(input: { userId: string; featureKey: UserRolloutFeatureKey; enabled: boolean; actorId: string; reason?: string | null }) {
    const key = `${input.userId}:${input.featureKey}`
    this.store.set(key, { userId: input.userId, featureKey: input.featureKey, enabled: input.enabled })
    return {
      id: `ufa_${input.featureKey}`,
      userId: input.userId,
      featureKey: input.featureKey,
      enabled: input.enabled,
      createdAt: new Date(),
      createdBy: input.actorId,
      updatedAt: new Date(),
      updatedBy: input.actorId,
      reason: input.reason ?? null,
    } as any
  }

  async revokeAllForUser(userId: string, actorId: string) {
    let count = 0
    for (const [k, v] of this.store.entries()) {
      if (v.userId === userId && v.enabled) {
        v.enabled = false
        count++
      }
    }
    return count
  }
}

describe('PHASE P14 — Consumer Rollout & Feature Access Model', () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...origEnv }
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    delete process.env.USER_PROFILES_ENABLED
    delete process.env.SOCIAL_GRAPH_ENABLED
    delete process.env.SMART_FEED_ENABLED
    delete process.env.SMART_FEED_RANKING_V1_ENABLED
    delete process.env.COLD_START_V2_ENABLED
    delete process.env.SMART_FEED_VIDEO_ENABLED
    delete process.env.SMART_FEED_TELEMETRY_ENABLED
  })

  afterEach(() => {
    process.env = { ...origEnv }
  })

  describe('1. Global flag defaults (Production safe)', () => {
    it('ensures all consumer flags default to TRUE globally in production', () => {
      expect(isGlobalUserFeatureEnabled('USER_PROFILES')).toBe(true)
      expect(isGlobalUserFeatureEnabled('SOCIAL_GRAPH')).toBe(true)
      expect(isGlobalUserFeatureEnabled('SMART_FEED')).toBe(true)
      expect(isGlobalUserFeatureEnabled('SMART_FEED_RANKING_V1')).toBe(true)
      expect(isGlobalUserFeatureEnabled('COLD_START_V2')).toBe(true)
      expect(isGlobalUserFeatureEnabled('SMART_FEED_VIDEO')).toBe(true)
      expect(isGlobalUserFeatureEnabled('SMART_FEED_TELEMETRY')).toBe(true)
    })
  })

  describe('2. Rollout dependency graph & closure', () => {
    it('verifies explicit feature dependencies', () => {
      expect(USER_FEATURE_DEPENDENCIES.USER_PROFILES).toEqual([])
      expect(USER_FEATURE_DEPENDENCIES.SOCIAL_GRAPH).toEqual([])
      expect(USER_FEATURE_DEPENDENCIES.SMART_FEED).toEqual(['SOCIAL_GRAPH'])
      expect(USER_FEATURE_DEPENDENCIES.SMART_FEED_RANKING_V1).toEqual(['SMART_FEED'])
      expect(USER_FEATURE_DEPENDENCIES.COLD_START_V2).toEqual(['SMART_FEED'])
      expect(USER_FEATURE_DEPENDENCIES.SMART_FEED_VIDEO).toEqual(['SMART_FEED'])
      expect(USER_FEATURE_DEPENDENCIES.SMART_FEED_TELEMETRY).toEqual(['SMART_FEED'])
    })

    it('calculates transitive dependency closure', () => {
      expect(userDependencyClosure('USER_PROFILES')).toEqual([])
      expect(userDependencyClosure('SOCIAL_GRAPH')).toEqual([])
      expect(userDependencyClosure('SMART_FEED')).toEqual(['SOCIAL_GRAPH'])
      expect(userDependencyClosure('SMART_FEED_RANKING_V1')).toEqual(['SOCIAL_GRAPH', 'SMART_FEED'])
      expect(userDependencyClosure('COLD_START_V2')).toEqual(['SOCIAL_GRAPH', 'SMART_FEED'])
    })
  })

  describe('3. Resolution logic: Global ON vs User Allowlist vs Dependency Blocked', () => {
    beforeEach(() => {
      process.env.USER_PROFILES_ENABLED = 'false'
      process.env.SOCIAL_GRAPH_ENABLED = 'false'
      process.env.SMART_FEED_ENABLED = 'false'
      process.env.SMART_FEED_RANKING_V1_ENABLED = 'false'
      process.env.COLD_START_V2_ENABLED = 'false'
      process.env.SMART_FEED_VIDEO_ENABLED = 'false'
      process.env.SMART_FEED_TELEMETRY_ENABLED = 'false'
    })

    it('returns off when neither global nor allowlist is enabled', () => {
      const res = resolveFeatureForUser({
        featureKey: 'SMART_FEED',
        allowlistedKeys: new Set(),
      })
      expect(res.enabled).toBe(false)
      expect(res.source).toBe('off')
    })

    it('returns dependency_blocked when child feature is granted but parent is missing', () => {
      const res = resolveFeatureForUser({
        featureKey: 'SMART_FEED',
        allowlistedKeys: new Set(['SMART_FEED']), // missing SOCIAL_GRAPH
      })
      expect(res.enabled).toBe(false)
      expect(res.source).toBe('dependency_blocked')
      expect(res.missingDependencies).toContain('SOCIAL_GRAPH')
    })

    it('returns allowlist when feature and all parent dependencies are granted', () => {
      const res = resolveFeatureForUser({
        featureKey: 'SMART_FEED',
        allowlistedKeys: new Set(['SOCIAL_GRAPH', 'SMART_FEED']),
      })
      expect(res.enabled).toBe(true)
      expect(res.source).toBe('allowlist')
      expect(res.missingDependencies).toHaveLength(0)
    })

    it('resolves ranking V1 when full dependency chain is granted', () => {
      const res = resolveFeatureForUser({
        featureKey: 'SMART_FEED_RANKING_V1',
        allowlistedKeys: new Set(['SOCIAL_GRAPH', 'SMART_FEED', 'SMART_FEED_RANKING_V1']),
      })
      expect(res.enabled).toBe(true)
      expect(res.source).toBe('allowlist')
    })

    it('returns global source when environment variable is set to true', () => {
      process.env.SMART_FEED_ENABLED = 'true'
      process.env.SOCIAL_GRAPH_ENABLED = 'true'

      const res = resolveFeatureForUser({
        featureKey: 'SMART_FEED',
        allowlistedKeys: new Set(),
      })
      expect(res.enabled).toBe(true)
      expect(res.source).toBe('global')
    })
  })

  describe('4. Allowlist grant validation', () => {
    beforeEach(() => {
      process.env.USER_PROFILES_ENABLED = 'false'
      process.env.SOCIAL_GRAPH_ENABLED = 'false'
      process.env.SMART_FEED_ENABLED = 'false'
      process.env.SMART_FEED_RANKING_V1_ENABLED = 'false'
      process.env.COLD_START_V2_ENABLED = 'false'
      process.env.SMART_FEED_VIDEO_ENABLED = 'false'
      process.env.SMART_FEED_TELEMETRY_ENABLED = 'false'
    })

    it('rejects unknown feature keys', () => {
      const val = validateUserAllowlistGrant({
        featureKey: 'INVALID_FEATURE',
        allowlistedKeys: new Set(),
      })
      expect(val.ok).toBe(false)
      expect((val as any).reason).toBe('UNKNOWN_FEATURE')
    })

    it('rejects grant when prerequisite dependencies are missing', () => {
      const val = validateUserAllowlistGrant({
        featureKey: 'SMART_FEED_RANKING_V1',
        allowlistedKeys: new Set(),
      })
      expect(val.ok).toBe(false)
      expect((val as any).reason).toContain('MISSING_DEPS')
    })

    it('approves grant when prerequisite dependencies are present', () => {
      const val = validateUserAllowlistGrant({
        featureKey: 'SMART_FEED_RANKING_V1',
        allowlistedKeys: new Set(['SOCIAL_GRAPH', 'SMART_FEED']),
      })
      expect(val.ok).toBe(true)
      expect((val as any).featureKey).toBe('SMART_FEED_RANKING_V1')
    })
  })

  describe('5. UserFeatureAccessService and Pilot Bundle / Kill Switch', () => {
    let service: UserFeatureAccessService
    let repo: InMemoryUserFeatureAccessRepo

    beforeEach(() => {
      process.env.USER_PROFILES_ENABLED = 'false'
      process.env.SOCIAL_GRAPH_ENABLED = 'false'
      process.env.SMART_FEED_ENABLED = 'false'
      process.env.SMART_FEED_RANKING_V1_ENABLED = 'false'
      process.env.COLD_START_V2_ENABLED = 'false'
      process.env.SMART_FEED_VIDEO_ENABLED = 'false'
      process.env.SMART_FEED_TELEMETRY_ENABLED = 'false'
      repo = new InMemoryUserFeatureAccessRepo()
      service = new UserFeatureAccessService(repo as any)
    })

    it('grants full pilot bundle idempotently to a pilot user', async () => {
      const results = await service.grantPilotBundle({
        userId: 'pilot_user_1',
        actorId: 'admin_1',
        reason: 'Internal pilot test',
      })
      expect(results.length).toBe(7)

      const enabledKeys = await service.getEnabledKeys('pilot_user_1')
      expect(enabledKeys.has('USER_PROFILES')).toBe(true)
      expect(enabledKeys.has('SOCIAL_GRAPH')).toBe(true)
      expect(enabledKeys.has('SMART_FEED')).toBe(true)
      expect(enabledKeys.has('SMART_FEED_RANKING_V1')).toBe(true)
      expect(enabledKeys.has('COLD_START_V2')).toBe(true)
      expect(enabledKeys.has('SMART_FEED_VIDEO')).toBe(true)
      expect(enabledKeys.has('SMART_FEED_TELEMETRY')).toBe(true)

      expect(await service.isEnabledForUser('pilot_user_1', 'SMART_FEED')).toBe(true)
      expect(await service.isEnabledForUser('pilot_user_1', 'SMART_FEED_RANKING_V1')).toBe(true)

      // Other non-pilot users remain disabled
      expect(await service.isEnabledForUser('regular_user_2', 'SMART_FEED')).toBe(false)
      expect(await service.isEnabledForUser(null, 'SMART_FEED')).toBe(false)
    })

    it('executes deterministic pilot kill switch by revoking all user grants', async () => {
      await service.grantPilotBundle({
        userId: 'pilot_user_1',
        actorId: 'admin_1',
      })
      expect(await service.isEnabledForUser('pilot_user_1', 'SMART_FEED')).toBe(true)

      const revoked = await service.revokePilotBundle({
        userId: 'pilot_user_1',
        actorId: 'admin_1',
      })
      expect(revoked).toBe(7)
      expect(await service.isEnabledForUser('pilot_user_1', 'SMART_FEED')).toBe(false)
      expect(await service.isEnabledForUser('pilot_user_1', 'USER_PROFILES')).toBe(false)
    })
  })

  describe('6. Signed Cursor Security & Session Stability', () => {
    it('encodes and verifies valid session tokens', () => {
      const session = feedSessionService.create('personal', ['art_1', 'art_2', 'art_3'])
      const token = feedSessionService.encode(session)
      const decoded = feedSessionService.decode(token)

      expect(decoded).not.toBeNull()
      expect(decoded?.sessionId).toBe(session.sessionId)
      expect(decoded?.rankedIds).toEqual(['art_1', 'art_2', 'art_3'])
      expect(decoded?.mode).toBe('personal')
    })

    it('rejects tampered or corrupt session tokens', () => {
      const session = feedSessionService.create('personal', ['art_1', 'art_2'])
      const token = feedSessionService.encode(session)
      const tampered = token.slice(0, -4) + 'abcd'

      expect(feedSessionService.decode(tampered)).toBeNull()
      expect(feedSessionService.decode('completely-invalid-token')).toBeNull()
    })
  })

  function makeCandidate(partial: Partial<FeedCandidateRow> & { articleId: string }): FeedCandidateRow {
    return {
      clusterId: null,
      publisherId: 'pub_test',
      publisherSlug: 'test-publisher',
      publisherName: 'Test Publisher',
      publisherLogoUrl: null,
      publisherVerified: false,
      headline: 'Default Headline',
      summary: null,
      category: 'gundem',
      image: null,
      video: null,
      publishedAt: new Date(),
      updatedAt: new Date(),
      breaking: false,
      materialUpdate: false,
      clusterSourceCount: 1,
      likesCount: 0,
      commentsCount: 0,
      savesCount: 0,
      sharesCount: 0,
      slug: 'default-slug',
      source: 'RECENT',
      sortScore: 0,
      ...partial,
    }
  }

  describe('7. Seen Suppression, Material Updates & Cluster Representative Selection', () => {
    it('selects the single best representative for multi-article clusters', () => {
      const candidates: FeedCandidateRow[] = [
        makeCandidate({
          articleId: 'art_c1_source1',
          clusterId: 'cluster_1',
          headline: 'Van Depremi Son Durum',
          summary: 'Van merkezli depremde can kaybı yok.',
          category: 'gundem',
          publishedAt: new Date(Date.now() - 3600000),
          updatedAt: new Date(Date.now() - 3600000),
          breaking: false,
          materialUpdate: false,
          clusterSourceCount: 3,
          likesCount: 5,
          commentsCount: 1,
          savesCount: 0,
          sharesCount: 0,
          source: 'RECENT',
          slug: 'van-depremi-1',
        }),
        makeCandidate({
          articleId: 'art_c1_source2',
          clusterId: 'cluster_1',
          headline: 'Van Depremi Yeni Açıklama (YENİ GELİŞME)',
          summary: 'AFAD son gelişmeleri duyurdu.',
          category: 'gundem',
          publishedAt: new Date(Date.now() - 1800000),
          updatedAt: new Date(Date.now() - 1800000),
          breaking: true,
          materialUpdate: true,
          clusterSourceCount: 3,
          likesCount: 12,
          commentsCount: 4,
          savesCount: 2,
          sharesCount: 1,
          source: 'BREAKING',
          slug: 'van-depremi-2',
        }),
      ]

      const reps = feedRepresentativeSelector.select(candidates)
      expect(reps).toHaveLength(1)
      expect(reps[0].articleId).toBe('art_c1_source2')
      expect(reps[0].materialUpdate).toBe(true)
    })
  })

  describe('8. Cold Start Profile & Onboarding Boost', () => {
    it('resolves NEW_USER profile for pilot user with zero signals', () => {
      const ctx: FeedUserContext = {
        userId: 'pilot_newbie',
        isSynthetic: false,
        city: 'Ankara',
        districtSlug: null,
        explicitInterests: [],
        behavioralInterests: new Map(),
        followedPublisherIds: new Set(),
        publisherAffinities: new Map(),
        negativePreferences: [],
      }

      const profile = feedColdStartService.resolveProfile(ctx)
      expect(profile).toBe('NEW_USER')
    })
  })

  describe('9. Scoring, Diversity & Negative Feedback', () => {
    it('applies heavy penalty to negative feedback targets', () => {
      const ctx: FeedUserContext = {
        userId: 'pilot_user_1',
        isSynthetic: false,
        city: 'İstanbul',
        districtSlug: null,
        explicitInterests: ['ekonomi'],
        behavioralInterests: new Map(),
        followedPublisherIds: new Set(),
        publisherAffinities: new Map(),
        negativePreferences: [
          {
            preferenceType: 'less',
            targetType: 'category',
            targetId: 'magazin',
            modifier: -1,
          },
        ],
      }

      const economyRow = makeCandidate({
        articleId: 'art_econ',
        headline: 'Merkez Bankası Faiz Kararı',
        category: 'ekonomi',
        publishedAt: new Date(),
        updatedAt: new Date(),
        breaking: true,
        materialUpdate: false,
        clusterSourceCount: 4,
        likesCount: 10,
        commentsCount: 2,
        savesCount: 1,
        sharesCount: 0,
        source: 'BREAKING',
        slug: 'faiz-karari',
      })

      const magazinRow = makeCandidate({
        articleId: 'art_mag',
        headline: 'Ünlü Oyuncu Evlendi',
        category: 'magazin',
        publishedAt: new Date(),
        updatedAt: new Date(),
        breaking: false,
        materialUpdate: false,
        clusterSourceCount: 1,
        likesCount: 1,
        commentsCount: 0,
        savesCount: 0,
        sharesCount: 0,
        source: 'RECENT',
        slug: 'unlu-oyuncu',
      })

      const scored = feedScoringService.scoreAll([economyRow, magazinRow], ctx, 'personal', new Set(), new Set())
      expect(scored[0].articleId).toBe('art_econ')
      expect(scored[1].articleId).toBe('art_mag')
      expect(scored[0].score).toBeGreaterThan(scored[1].score)
      expect(scored[1].breakdown.penalties).toBeGreaterThan(0)
    })
  })
})
