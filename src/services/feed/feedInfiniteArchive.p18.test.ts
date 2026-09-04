/**
 * P18 infinite category archive — Feed V2 Magazin / category pagination invariants.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  NFRANK_CONFIG_V1,
  nfRankArchiveRediscoveryScore,
  nfRankFreshnessScore,
} from '@/lib/feed/nfRankConfig'
import { feedSessionService } from '@/services/feed/FeedSessionService'
import { encodeFeedCursor, decodeFeedCursor } from '@/services/feed/feedUtils'

describe('P18 infinite category archive', () => {
  const feedServiceSrc = readFileSync(
    join(process.cwd(), 'src/services/feed/FeedService.ts'),
    'utf8'
  )
  const candidateSrc = readFileSync(
    join(process.cwd(), 'src/services/feed/FeedCandidateService.ts'),
    'utf8'
  )
  const clientSrc = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
    'utf8'
  )

  it('uses category-native Firestore query (status+categoryId+publishedAt), not global post-filter only', () => {
    expect(candidateSrc).toContain("where('categoryId', '==', catId)")
    expect(candidateSrc).toContain('FS_CATEGORY_MAX_ATTEMPTS')
    expect(candidateSrc).toContain('category-native')
  })

  it('category path uses session exclusion and does not soft-refill by dropping seen', () => {
    expect(feedServiceSrc).toContain('session-wide exclusion')
    expect(feedServiceSrc).toContain('never drop seen to fake infinity')
    expect(feedServiceSrc).not.toContain('allow category re-browse of older/seen')
    expect(feedServiceSrc).toContain("rankingVersion: 'category_mix_v1'")
    expect(feedServiceSrc).toContain('feedSessionService')
  })

  it('cursor preserves session for category continuation', () => {
    const session = feedSessionService.create('personal', ['a1', 'a2', 'a3'], 1, {
      category: 'magazin',
      olderThan: '2026-01-01T00:00:00.000Z',
    })
    const token = feedSessionService.encode(session)
    const cursor = encodeFeedCursor({
      publishedAt: '2026-01-01T00:00:00.000Z',
      id: 'a3',
      session: token,
      offset: 3,
    })
    const decoded = decodeFeedCursor(cursor)
    expect(decoded?.session).toBeTruthy()
    const roundTrip = feedSessionService.decode(decoded!.session!)
    expect(roundTrip?.category).toBe('magazin')
    expect(roundTrip?.rankedIds).toEqual(['a1', 'a2', 'a3'])
  })

  it('session appendWindow never replays IDs across pages', () => {
    let session = feedSessionService.create('personal', ['a', 'b', 'c'], 1, { category: 'magazin' })
    session = feedSessionService.appendWindow(session, ['c', 'd', 'e'], '2020-01-01T00:00:00.000Z')
    expect(session.rankedIds.filter((id) => id === 'c').length).toBe(1)
    expect(session.rankedIds).toContain('d')
    expect(session.rankedIds).toContain('e')
  })

  it('24h/48h/7d age is not a hard eligibility wall in NFRank freshness (ranking feature only)', () => {
    const now = Date.now()
    const d1 = nfRankFreshnessScore(new Date(now - 25 * 3_600_000), 'magazin', false, now)
    const d7 = nfRankFreshnessScore(new Date(now - 8 * 24 * 3_600_000), 'magazin', false, now)
    expect(d1).toBeGreaterThan(0)
    expect(d7).toBeGreaterThan(0)
    expect(d1).toBeGreaterThan(d7)
  })

  it('archive rediscovery is affinity-gated and skips breaking', () => {
    const now = Date.now()
    const old = new Date(now - 30 * 24 * 3_600_000)
    expect(
      nfRankArchiveRediscoveryScore({
        publishedAt: old,
        category: 'magazin',
        breaking: true,
        categoryAffinity: 0.9,
        publisherAffinity: 0.9,
        quality: 0.8,
        nowMs: now,
      })
    ).toBe(0)
    expect(
      nfRankArchiveRediscoveryScore({
        publishedAt: old,
        category: 'magazin',
        breaking: false,
        categoryAffinity: 0.1,
        publisherAffinity: 0,
        quality: 0.8,
        nowMs: now,
      })
    ).toBe(0)
    const hit = nfRankArchiveRediscoveryScore({
      publishedAt: old,
      category: 'magazin',
      breaking: false,
      categoryAffinity: 0.8,
      publisherAffinity: 0.5,
      quality: 0.7,
      nowMs: now,
    })
    expect(hit).toBeGreaterThan(0)
    expect(hit).toBeLessThanOrEqual(NFRANK_CONFIG_V1.archiveRediscovery.maxContribution)
  })

  it('Feed V2 client keeps category on paginated fetches', () => {
    expect(clientSrc).toContain('category: activeCategory')
    expect(clientSrc).toContain('EMPTY_PAGE_REFILL_MAX')
  })

  it('does not grant NFRANK live in this phase (isolation preserved)', () => {
    const flags = readFileSync(join(process.cwd(), 'src/lib/feed/featureFlag.ts'), 'utf8')
    expect(flags).toContain('isNfRankLiveEnabled')
    expect(flags).toMatch(/return false\s*\n}/)
  })
})
