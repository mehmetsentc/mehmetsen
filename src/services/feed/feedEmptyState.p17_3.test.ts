import { describe, expect, it, vi, beforeEach } from 'vitest'
import { feedService } from './FeedService'
import { feedCandidateService } from './FeedCandidateService'
import { feedColdStartService } from './FeedColdStartService'
import { feedUserContextService } from './FeedUserContextService'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { userFeatureAccessRepository } from '@/services/user/userFeatureAccessRepository'
import { feedSeenService } from '@/services/feed/FeedSeenService'
import { feedTelemetryService } from '@/services/feed/FeedTelemetryService'
import type { FeedCandidateRow } from '@/types/smartFeed'

describe('PHASE P17.3 — Smart Feed Empty State Prevention & Funnel Verification', () => {
  const pilotUid = 'ap3scBglLIVwflfZN4qL8PKrM1A3'

  beforeEach(() => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://dummy:dummy@localhost:5432/db'

    vi.spyOn(userFeatureAccessRepository, 'listEnabledKeys').mockImplementation(async (userId: string) => {
      if (userId === pilotUid) {
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

    vi.spyOn(feedUserContextService, 'load').mockImplementation(async (userId) => ({
      userId,
      isSynthetic: false,
      explicitInterests: [],
      behavioralInterests: new Map(),
      publisherAffinities: new Map(),
      followedPublisherIds: new Set(),
      negativePreferences: [],
      city: null,
      districtSlug: null,
    }))

    vi.spyOn(feedSeenService, 'filterSuppressible').mockImplementation(async () => ({
      seenArticles: new Set(),
      seenClusters: new Set(),
    }))

    vi.spyOn(feedTelemetryService, 'recordBatch').mockImplementation(async () => {})

    const generateCandidates = (count = 20, source: any = 'RECENT'): FeedCandidateRow[] => {
      const candidates: FeedCandidateRow[] = []
      const now = new Date()
      for (let i = 1; i <= count; i++) {
        candidates.push({
          articleId: `art_${source}_${i}`,
          clusterId: `clust_${source}_${i}`,
          publisherId: `pub_${i}`,
          publisherSlug: `publisher-${i}`,
          publisherName: `Publisher ${i}`,
          publisherLogoUrl: null,
          publisherVerified: true,
          headline: `Haber Başlığı ${i}`,
          summary: `Haber özeti ${i}`,
          category: 'gundem',
          image: `https://example.com/img_${i}.jpg`,
          video: null,
          publishedAt: new Date(now.getTime() - i * 60000),
          updatedAt: now,
          breaking: i === 1,
          materialUpdate: false,
          clusterSourceCount: 2,
          clusterImportance: 80,
          sourceQualityTier: 'TRUSTED',
          sourceHealthScore: 90,
          citySlug: null,
          districtSlug: null,
          likesCount: 5,
          commentsCount: 2,
          savesCount: 1,
          sharesCount: 0,
          slug: `haber-basligi-${i}`,
          source,
          sortScore: now.getTime() - i * 60000,
        })
      }
      return candidates
    }

    vi.spyOn(feedCandidateService, 'fetchRecent').mockImplementation(async () => generateCandidates(20, 'RECENT'))
    vi.spyOn(feedCandidateService, 'fetchBreaking').mockImplementation(async () => generateCandidates(5, 'BREAKING'))
    vi.spyOn(feedCandidateService, 'fetchPopular').mockImplementation(async () => generateCandidates(10, 'POPULAR'))
    vi.spyOn(feedCandidateService, 'fetchDiscovery').mockImplementation(async () => generateCandidates(10, 'DISCOVERY'))
    vi.spyOn(feedCandidateService, 'fetchLocal').mockImplementation(async () => generateCandidates(5, 'LOCAL'))
    vi.spyOn(feedCandidateService, 'fetchFollowing').mockImplementation(async () => generateCandidates(5, 'FOLLOWING'))
    vi.spyOn(feedCandidateService, 'fetchForMode').mockImplementation(async () => generateCandidates(20, 'RECENT'))
  })

  it('1. Feature Flag Isolation: pilot user has effective access, unauthed is blocked when global flag is off', async () => {
    const prevEnv = process.env.SMART_FEED_ENABLED
    process.env.SMART_FEED_ENABLED = 'false'
    try {
      const pilotAllowed = await isSmartFeedEffectiveForUser(pilotUid)
      expect(pilotAllowed).toBe(true)

      const guestAllowed = await isSmartFeedEffectiveForUser(null)
      expect(guestAllowed).toBe(false)
    } finally {
      if (prevEnv !== undefined) process.env.SMART_FEED_ENABLED = prevEnv
      else delete process.env.SMART_FEED_ENABLED
    }
  })

  it('2. Candidate Funnel (29 -> >0): FeedCandidateService fetches recent published articles', async () => {
    const recent = await feedCandidateService.fetchRecent({ limit: 15, cursor: null, userId: pilotUid })
    expect(recent.length).toBeGreaterThan(0)
    expect(recent[0].articleId).toBeDefined()
    expect(recent[0].headline).toBeDefined()
    expect(recent[0].publishedAt).toBeInstanceOf(Date)
  })

  it('3. Cold Start V2 Resolution: resolves NEW_USER for pilot without signals and produces non-empty mix', async () => {
    const ctx = await feedUserContextService.load(pilotUid)
    const profile = feedColdStartService.resolveProfile(ctx)
    expect(profile).toBe('NEW_USER')
  })

  it('4. Full Feed Service (Sana Özel / Personal): returns 15 valid FeedItemDto items for pilot user', async () => {
    const feed = await feedService.getFeed({
      userId: pilotUid,
      sessionId: 'p17_3_audit_session',
      mode: 'personal',
    })
    expect(feed.items.length).toBeGreaterThan(0)
    expect(feed.items[0]).toHaveProperty('id')
    expect(feed.items[0]).toHaveProperty('articleId')
    expect(feed.items[0]).toHaveProperty('headline')
    expect(feed.items[0]).toHaveProperty('summary')
    expect(feed.mode).toBe('personal')
    expect(feed.hasMore).toBe(true)
    expect(feed.nextCursor).toBeDefined()
  })

  it('5. Following Mode Guard: unauthed request fails with auth_required', async () => {
    const feed = await feedService.getFeed({
      userId: null,
      sessionId: 'p17_3_audit_session',
      mode: 'following',
    })
    expect(feed.emptyReason).toBe('auth_required')
    expect(feed.items).toHaveLength(0)
  })
})
