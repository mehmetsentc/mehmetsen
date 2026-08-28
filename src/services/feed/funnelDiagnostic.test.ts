import { describe, expect, it, vi, beforeEach } from 'vitest'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { signCmsSessionToken } from '@/lib/cmsSession'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { userFeatureAccessRepository } from '@/services/user/userFeatureAccessRepository'
import { feedCandidateService } from '@/services/feed/FeedCandidateService'
import { feedUserContextService } from '@/services/feed/FeedUserContextService'
import { feedSeenService } from '@/services/feed/FeedSeenService'
import { feedTelemetryService } from '@/services/feed/FeedTelemetryService'
import { feedService } from './FeedService'
import type { FeedCandidateRow } from '@/types/smartFeed'

describe('P17.3A Live Browser Feed Diagnostic & Session Verification', () => {
  const pilotUid = 'ap3scBglLIVwflfZN4qL8PKrM1A3'
  const operatorUid = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'

  beforeEach(() => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://dummy:dummy@localhost:5432/db'

    vi.spyOn(userFeatureAccessRepository, 'listEnabledKeys').mockImplementation(async (userId: string) => {
      if (userId === pilotUid || userId === operatorUid) {
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

  it('1. verifyFirebaseIdToken: extracts uid from signed cms_session cookie when Bearer is missing', async () => {
    const sessionToken = await signCmsSessionToken({
      uid: operatorUid,
      role: 'super_admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    const req = new Request('https://nahaber.com/api/feed/v2', {
      headers: {
        cookie: `cms_session=${sessionToken}; other=123`,
      },
    })

    const auth = await verifyFirebaseIdToken(req)
    expect(auth).not.toBeNull()
    expect(auth?.uid).toBe(operatorUid)
  })

  it('2. isSmartFeedEffectiveForUser: allows both pilot user and operator user, rejects non-allowlisted guest when global flag is off', async () => {
    const prevEnv = process.env.SMART_FEED_ENABLED
    process.env.SMART_FEED_ENABLED = 'false'
    try {
      const pilotAllowed = await isSmartFeedEffectiveForUser(pilotUid)
      expect(pilotAllowed).toBe(true)

      const operatorAllowed = await isSmartFeedEffectiveForUser(operatorUid)
      expect(operatorAllowed).toBe(true)

      const guestAllowed = await isSmartFeedEffectiveForUser(null)
      expect(guestAllowed).toBe(false)
    } finally {
      if (prevEnv !== undefined) process.env.SMART_FEED_ENABLED = prevEnv
      else delete process.env.SMART_FEED_ENABLED
    }
  })

  it('3. feedService.getFeed: returns rich feed items for operator user in personal mode', async () => {
    const feed = await feedService.getFeed({
      userId: operatorUid,
      sessionId: 'test_p17_3a_diagnostic_operator',
      mode: 'personal',
      limit: 15,
    })

    expect(feed.items.length).toBeGreaterThanOrEqual(15)
    expect(feed.mode).toBe('personal')
    expect(feed.items[0]).toHaveProperty('articleId')
    expect(feed.items[0]).toHaveProperty('headline')
  })

  it('4. /api/feed/v2 GET: returns HTTP 200 with feed items for operator user', async () => {
    const { GET } = await import('@/app/api/feed/v2/route')
    const sessionToken = await signCmsSessionToken({
      uid: operatorUid,
      role: 'super_admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    const req = new Request('https://nahaber.com/api/feed/v2?mode=personal&limit=15', {
      headers: {
        cookie: `cms_session=${sessionToken}`,
      },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.mode).toBe('personal')
    expect(data.items.length).toBeGreaterThanOrEqual(15)
    expect(data.items[0]).toHaveProperty('articleId')
    expect(data.items[0]).toHaveProperty('headline')
  })
})
