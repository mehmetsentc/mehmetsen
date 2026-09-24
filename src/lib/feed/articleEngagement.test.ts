import { describe, expect, it } from 'vitest'
import { FEED_IMPRESSION_CONFIG } from '@/lib/feed/config'
import {
  FEED_VIEW_CONFIG,
  clampEngagementDwellMs,
  nextEngagementFlush,
  shouldCountEngagementView,
  readMinutesFromDurationMs,
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

  it('feed/story views count only at 3s+; open counts immediately', () => {
    expect(shouldCountEngagementView('feed', 2999)).toBe(false)
    expect(shouldCountEngagementView('story', 2999)).toBe(false)
    expect(shouldCountEngagementView('feed', 3000)).toBe(true)
    expect(shouldCountEngagementView('story', 3000)).toBe(true)
    expect(shouldCountEngagementView('open', 0)).toBe(true)
    expect(shouldCountEngagementView('open', 400)).toBe(true)
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

  it('wires Feed 2, story, article page, and news/view into the engagement writer', () => {
    const root = process.cwd()
    const feed = readFileSync(join(root, 'src/components/feed/smart/SmartFeedClient.tsx'), 'utf8')
    const story = readFileSync(join(root, 'src/components/home/StoryViewer.tsx'), 'utf8')
    const hook = readFileSync(join(root, 'src/hooks/useNewsViewIncrement.ts'), 'utf8')
    const viewRoute = readFileSync(join(root, 'src/app/api/news/view/route.ts'), 'utf8')
    const impressionHook = readFileSync(join(root, 'src/lib/feed/feedSeenClient.ts'), 'utf8')
    expect(feed).toContain('postArticleEngagement')
    expect(feed).toContain("source: 'feed'")
    expect(story).toContain('createEngagementTracker')
    expect(story).toContain("createEngagementTracker('story')")
    expect(hook).toContain("createEngagementTracker('open')")
    expect(viewRoute).toContain('recordArticleEngagement')
    expect(impressionHook).toContain('FEED_VIEW_CONFIG.minVisibleMs')
    const client = readFileSync(join(root, 'src/lib/feed/articleEngagementClient.ts'), 'utf8')
    expect(client).toContain('/api/news/engagement')
  })
})
