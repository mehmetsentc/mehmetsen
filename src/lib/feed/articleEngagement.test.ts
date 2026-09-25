import { describe, expect, it } from 'vitest'
import { FEED_IMPRESSION_CONFIG } from '@/lib/feed/config'
import {
  FEED_VIEW_CONFIG,
  applyWatchSessionWrite,
  averageDurationMs,
  clampEngagementDwellMs,
  engagementSourceToSurface,
  formatDurationCompact,
  nextEngagementFlush,
  publicArticleSocialCounts,
  shouldCountEngagementView,
  readMinutesFromDurationMs,
  watchActorKey,
} from '@/lib/feed/articleEngagement'
import { viewPopularityScore, FEED_RANKING_CONFIG_V1 } from '@/lib/feed/rankingConfig'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('article engagement (3s view + read time)', () => {
  it('does not change qualified impression gate (60% / 750ms)', () => {
    expect(FEED_IMPRESSION_CONFIG.visibilityRatio).toBe(0.6)
    expect(FEED_IMPRESSION_CONFIG.minVisibleMs).toBe(750)
    expect(FEED_VIEW_CONFIG.minVisibleMs).toBe(3000)
    expect(FEED_VIEW_CONFIG.minVisibleMs).toBeGreaterThan(FEED_IMPRESSION_CONFIG.minVisibleMs)
  })

  it('feed/story views count only at 3s+; open/reader/page count immediately', () => {
    expect(shouldCountEngagementView('feed', 2999)).toBe(false)
    expect(shouldCountEngagementView('story', 2999)).toBe(false)
    expect(shouldCountEngagementView('feed', 3000)).toBe(true)
    expect(shouldCountEngagementView('story', 3000)).toBe(true)
    expect(shouldCountEngagementView('open', 0)).toBe(true)
    expect(shouldCountEngagementView('reader', 0)).toBe(true)
    expect(shouldCountEngagementView('page', 0)).toBe(true)
    expect(shouldCountEngagementView('open', 400)).toBe(true)
  })

  it('maps sources to watch surfaces', () => {
    expect(engagementSourceToSurface('feed')).toBe('feed')
    expect(engagementSourceToSurface('story')).toBe('story')
    expect(engagementSourceToSurface('open')).toBe('reader')
    expect(engagementSourceToSurface('reader')).toBe('reader')
    expect(engagementSourceToSurface('page')).toBe('page')
  })

  it('builds actor keys for uid vs guest hash', () => {
    expect(watchActorKey('abc', 'hash')).toBe('u:abc')
    expect(watchActorKey(null, 'deadbeef')).toBe('g:deadbeef')
    expect(watchActorKey('', '')).toBeNull()
  })

  it('clamps dwell and drops junk', () => {
    expect(clampEngagementDwellMs(-4)).toBe(0)
    expect(clampEngagementDwellMs('nope')).toBe(0)
    expect(clampEngagementDwellMs(90 * 60 * 1000)).toBe(30 * 60 * 1000)
    expect(clampEngagementDwellMs(4500)).toBe(4500)
  })

  it('flushes 3s feed view once, then only extra dwell', () => {
    const first = nextEngagementFlush(
      { elapsedMs: 3200, flushedMs: 0, viewCounted: false },
      'feed'
    )
    expect(first.countView).toBe(true)
    expect(first.dwellDeltaMs).toBe(3200)

    const second = nextEngagementFlush(
      { elapsedMs: 8000, flushedMs: first.nextFlushedMs, viewCounted: first.nextViewCounted },
      'feed'
    )
    expect(second.countView).toBe(false)
    expect(second.dwellDeltaMs).toBe(4800)

    const skip = nextEngagementFlush(
      { elapsedMs: 1800, flushedMs: 0, viewCounted: false },
      'feed'
    )
    expect(skip.countView).toBe(false)
    expect(skip.dwellDeltaMs).toBe(0)
  })

  it('open counts a view even with tiny dwell', () => {
    const open = nextEngagementFlush({ elapsedMs: 0, flushedMs: 0, viewCounted: false }, 'open')
    expect(open.countView).toBe(true)
    const page = nextEngagementFlush({ elapsedMs: 0, flushedMs: 0, viewCounted: false }, 'page')
    expect(page.countView).toBe(true)
  })

  it('upserts one session: heartbeat does not create a new row or second view', () => {
    const first = applyWatchSessionWrite({
      existing: null,
      surface: 'feed',
      dwellDeltaMs: 3200,
      countView: true,
    })
    expect(first.isNew).toBe(true)
    expect(first.viewDelta).toBe(1)
    expect(first.contentDelta).toBe(3200)
    expect(first.pageDelta).toBe(0)
    expect(first.watchSessionDelta).toBe(1)
    expect(first.pageSessionDelta).toBe(0)

    const heartbeat = applyWatchSessionWrite({
      existing: { viewCounted: first.nextViewCounted },
      surface: 'feed',
      dwellDeltaMs: 10_000,
      countView: true,
    })
    expect(heartbeat.isNew).toBe(false)
    expect(heartbeat.viewDelta).toBe(0)
    expect(heartbeat.contentDelta).toBe(10_000)
    expect(heartbeat.watchSessionDelta).toBe(0)
  })

  it('page dwell is separate from content dwell and averages skip divide-by-zero', () => {
    const page = applyWatchSessionWrite({
      existing: null,
      surface: 'page',
      dwellDeltaMs: 45_000,
      countView: true,
    })
    expect(page.contentDelta).toBe(0)
    expect(page.pageDelta).toBe(45_000)
    expect(page.pageSessionDelta).toBe(1)
    expect(averageDurationMs(90_000, 2)).toBe(45_000)
    expect(averageDurationMs(12_000, 0)).toBe(0)
    expect(averageDurationMs(0, 4)).toBe(0)
    expect(formatDurationCompact(90_000)).toBe('1 dk 30 sn')
  })

  it('public DTO counts never include duration fields', () => {
    const counts = publicArticleSocialCounts({
      likesCount: 2,
      commentsCount: 1,
      savesCount: 3,
      sharesCount: 4,
      viewsCount: 9,
    })
    expect(counts).toEqual({ likes: 2, comments: 1, saves: 3, shares: 4, views: 9 })
    expect(counts).not.toHaveProperty('readDurationMs')
    expect(counts).not.toHaveProperty('pageDurationMs')
    expect(JSON.stringify(counts)).not.toMatch(/duration/i)
  })

  it('read minutes feed ranking: longer total read outranks equal views', () => {
    const publishedAt = new Date()
    const short = viewPopularityScore({
      viewsCount: 40,
      readDurationMs: 30_000,
      likesCount: 0,
      commentsCount: 0,
      savesCount: 0,
      sharesCount: 0,
      publishedAt,
    })
    const long = viewPopularityScore({
      viewsCount: 40,
      readDurationMs: 10 * 60_000,
      likesCount: 0,
      commentsCount: 0,
      savesCount: 0,
      sharesCount: 0,
      publishedAt,
    })
    expect(long).toBeGreaterThan(short)
    expect(FEED_RANKING_CONFIG_V1.popularityReadMinuteWeight).toBeGreaterThan(0)
    expect(readMinutesFromDurationMs(180_000)).toBe(3)
  })

  it('ranking prefers real reads (high avg dwell) over the same total skimmed across many sessions', () => {
    const publishedAt = new Date()
    const totalMs = 10 * 60_000
    const skim = viewPopularityScore({
      viewsCount: 40,
      readDurationMs: totalMs,
      watchSessionCount: 200,
      likesCount: 0,
      commentsCount: 0,
      savesCount: 0,
      sharesCount: 0,
      publishedAt,
    })
    const deep = viewPopularityScore({
      viewsCount: 40,
      readDurationMs: totalMs,
      watchSessionCount: 2,
      likesCount: 0,
      commentsCount: 0,
      savesCount: 0,
      sharesCount: 0,
      publishedAt,
    })
    expect(deep).toBeGreaterThan(skim)
    const withPage = viewPopularityScore({
      viewsCount: 40,
      readDurationMs: totalMs,
      watchSessionCount: 2,
      pageDurationMs: 6 * 60_000,
      pageSessionCount: 2,
      likesCount: 0,
      commentsCount: 0,
      savesCount: 0,
      sharesCount: 0,
      publishedAt,
    })
    expect(withPage).toBeGreaterThan(deep)
    expect(FEED_RANKING_CONFIG_V1.popularityAvgReadMinuteWeight).toBeGreaterThan(0)
    expect(FEED_RANKING_CONFIG_V1.popularityAvgPageMinuteWeight).toBeGreaterThan(0)
  })

  it('wires Feed 2, story, article page, and news/view into the engagement writer', () => {
    const root = process.cwd()
    const feed = readFileSync(join(root, 'src/components/feed/smart/SmartFeedClient.tsx'), 'utf8')
    const story = readFileSync(join(root, 'src/components/home/StoryViewer.tsx'), 'utf8')
    const hook = readFileSync(join(root, 'src/hooks/useNewsViewIncrement.ts'), 'utf8')
    const viewRoute = readFileSync(join(root, 'src/app/api/news/view/route.ts'), 'utf8')
    const impressionHook = readFileSync(join(root, 'src/lib/feed/feedSeenClient.ts'), 'utf8')
    expect(feed).toContain('postArticleEngagement')
    expect(feed).toContain("source: 'feed'")
    expect(feed).toContain("source: 'reader'")
    expect(story).toContain('createEngagementTracker')
    expect(story).toContain("createEngagementTracker('story')")
    expect(hook).toContain("createEngagementTracker('page')")
    expect(viewRoute).toContain('recordArticleEngagement')
    expect(impressionHook).toContain('FEED_VIEW_CONFIG.minVisibleMs')
    const client = readFileSync(join(root, 'src/lib/feed/articleEngagementClient.ts'), 'utf8')
    expect(client).toContain('/api/news/engagement')
    expect(client).toContain('sessionId')
    expect(client).toContain('Authorization')
    const scoring = readFileSync(join(root, 'src/services/feed/FeedScoringService.ts'), 'utf8')
    const popular = readFileSync(join(root, 'src/services/feed/FeedCandidateService.ts'), 'utf8')
    const nf = readFileSync(join(root, 'src/services/feed/nfRank/NFRankEngine.ts'), 'utf8')
    expect(scoring).toContain('popularityRawScore')
    expect(scoring).toContain('watchSessionCount')
    expect(popular).toContain('watchSessionCount')
    expect(popular).toContain('pageSessionCount')
    expect(nf).toContain('articleWatchRankingSignals')
  })

  it('does not leak dwell on public feed DTO or homepage slim items', () => {
    const root = process.cwd()
    const feedService = readFileSync(join(root, 'src/services/feed/FeedService.ts'), 'utf8')
    const types = readFileSync(join(root, 'src/types/smartFeed.ts'), 'utf8')
    const slim = readFileSync(join(root, 'src/lib/newsItemUtils.ts'), 'utf8')
    expect(feedService).toContain('publicArticleSocialCounts')
    expect(feedService).not.toMatch(/socialCounts:[\s\S]{0,200}readDuration/)
    expect(types).toMatch(/export interface FeedSocialCounts \{[^}]*views: number/)
    expect(types).not.toMatch(/export interface FeedItemDto \{[^}]*readDurationMs/)
    expect(slim).not.toContain('readDurationMs')
    expect(slim).not.toContain('pageDurationMs')
    const rail = readFileSync(join(root, 'src/components/social/SocialActionRail.tsx'), 'utf8')
    expect(rail).toContain('viewCount')
    expect(rail).not.toMatch(/dk okundu|saniye kald/)
  })

  it('admin insights API is staff-gated and returns session averages', () => {
    const root = process.cwd()
    const route = readFileSync(join(root, 'src/app/api/admin/news/[id]/insights/route.ts'), 'utf8')
    const server = readFileSync(join(root, 'src/services/feed/articleInsights.server.ts'), 'utf8')
    const panel = readFileSync(join(root, 'src/components/admin/ArticleInsightsPanel.tsx'), 'utf8')
    expect(route).toContain('verifyCmsToken')
    expect(route).toContain('news:edit')
    expect(server).toContain('averageDurationMs')
    expect(server).toContain('recentSessions')
    expect(panel).toContain('Ort. sayfa durma')
    expect(panel).toContain('/api/admin/news/')
  })
})
