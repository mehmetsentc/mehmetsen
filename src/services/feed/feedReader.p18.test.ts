import { describe, expect, it } from 'vitest'
import {
  classifyAxisIntent,
  feedToReaderProgress,
  readerToFeedProgress,
  shouldCompleteTransition,
  shouldIgnoreSystemBackEdge,
} from '@/lib/feed/reader/gestureArbitration'
import {
  computeReadDepthPercent,
  crossedReadDepthThresholds,
} from '@/lib/feed/reader/readDepth'
import { ReaderDwellTracker } from '@/lib/feed/reader/dwellTracker'
import {
  buildFeedReaderUrl,
  isFeedReaderHistoryState,
  parseReaderSlugFromSearch,
} from '@/lib/feed/reader/history'
import { isFeedReaderV1Enabled } from '@/lib/feed/featureFlag'
import { USER_ROLLOUT_FEATURE_KEYS } from '@/types/userRollout'
import { USER_FEATURE_DEPENDENCIES, resolveFeatureForUser } from '@/lib/user/userRolloutMatrix'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Feed Reader foundation', () => {
  it('registers FEED_READER_V1 with SMART_FEED dependency and global default off', () => {
    expect(USER_ROLLOUT_FEATURE_KEYS).toContain('FEED_READER_V1')
    expect(USER_FEATURE_DEPENDENCIES.FEED_READER_V1).toEqual(['SMART_FEED'])
    expect(isFeedReaderV1Enabled()).toBe(false)
    const off = resolveFeatureForUser({
      featureKey: 'FEED_READER_V1',
      allowlistedKeys: new Set(),
    })
    expect(off.enabled).toBe(false)
    const grant = resolveFeatureForUser({
      featureKey: 'FEED_READER_V1',
      allowlistedKeys: new Set(['FEED_READER_V1', 'SMART_FEED', 'SOCIAL_GRAPH']),
    })
    expect(grant.enabled).toBe(true)
    expect(grant.source).toBe('allowlist')
  })

  it('arbitrates horizontal vs vertical intent and ignores iOS back edge', () => {
    expect(classifyAxisIntent(-40, 5)).toBe('horizontal')
    expect(classifyAxisIntent(5, -40)).toBe('vertical')
    expect(classifyAxisIntent(5, 5)).toBe('none')
    expect(shouldIgnoreSystemBackEdge(10, 390)).toBe(true)
    expect(shouldIgnoreSystemBackEdge(80, 390)).toBe(false)
    expect(feedToReaderProgress(-195, 390)).toBeCloseTo(0.5, 2)
    expect(readerToFeedProgress(195, 390)).toBeCloseTo(0.5, 2)
    expect(shouldCompleteTransition({ progress: 0.5, velocityX: 0 })).toBe(true)
    expect(shouldCompleteTransition({ progress: 0.1, velocityX: 0 })).toBe(false)
  })

  it('dedupes read-depth thresholds and computes percent', () => {
    expect(computeReadDepthPercent({ scrollTop: 0, clientHeight: 100, scrollHeight: 100 })).toBe(100)
    expect(computeReadDepthPercent({ scrollTop: 450, clientHeight: 100, scrollHeight: 1000 })).toBe(50)
    const seen = new Set<number>([25])
    expect(crossedReadDepthThresholds(80, seen)).toEqual([50, 75])
    expect(crossedReadDepthThresholds(20, seen)).toEqual([])
  })

  it('pauses dwell when document hidden', () => {
    let now = 1_000
    const t = new ReaderDwellTracker(() => now)
    t.open()
    now = 1_500
    expect(t.sample()).toBe(500)
    t.setDocumentVisible(false)
    now = 3_000
    expect(t.sample()).toBe(500)
    t.setDocumentVisible(true)
    now = 3_400
    expect(t.close()).toBe(900)
  })

  it('builds reader history URL and recognizes state', () => {
    expect(buildFeedReaderUrl('ornek-haber')).toBe('/feed-v2?reader=ornek-haber')
    expect(parseReaderSlugFromSearch('?reader=abc')).toBe('abc')
    expect(
      isFeedReaderHistoryState({ nahaberFeedReader: true, articleId: '1', slug: 's' })
    ).toBe(true)
    expect(isFeedReaderHistoryState({ foo: 1 })).toBe(false)
  })

  it('wires Haberi Oku to FeedArticleReader when gated', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/feed/v2/reader/[slug]/route.ts'),
      'utf8'
    )
    expect(client).toContain('FeedArticleReader')
    expect(client).toContain('feedReaderEnabled')
    expect(client).toContain("'feed_reader'")
    expect(client).toContain('article_dwell')
    expect(reader).toContain('prefersReducedMotion')
    expect(reader).toContain('Haber ayrıntıları yüklenemedi')
    expect(reader).toContain('Tam haber sayfasını aç')
    expect(route).toContain('isFeedReaderEffectiveForUser')
    expect(route).toContain('loadFeedReaderArticle')
    expect(route).not.toMatch(/openai|anthropic|generateText/i)
  })

  it('does not remove canonical article page', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/app/(main)/haber/[slug]/page.tsx'),
      'utf8'
    )
    expect(page).toContain('NewsDetailPage')
  })
})
