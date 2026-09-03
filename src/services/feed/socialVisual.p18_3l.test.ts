import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * P18.3L — Visual geometry + social counter consistency.
 * No Production engagement mutations.
 */

describe('P18.3L social counter wiring', () => {
  it('SmartFeedClient hydrates batch like/comment/save counts and updates on mutation', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(src).toContain('saveCount')
    expect(src).toContain('typeof s.likeCount === \'number\'')
    expect(src).toContain('typeof s.commentCount === \'number\'')
    expect(src).toContain('typeof s.saveCount === \'number\'')
    expect(src).toContain('commentCount={commentCount}')
    expect(src).toContain('saveCount={saveCount}')
    expect(src).toContain('commentCount:')
    expect(src).toContain('nextCommentCount')
    expect(src).toContain('saveCount: nextSaveCount')
  })

  it('FullscreenNewsCard passes live comment/save counts — not DTO-only', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('resolvedCommentCount')
    expect(card).toContain('resolvedSaveCount')
    expect(card).toContain('commentCount={resolvedCommentCount}')
    expect(card).toContain('saveCount={resolvedSaveCount}')
    expect(card).not.toMatch(/commentCount=\{item\.socialCounts\.comments\}/)
  })

  it('SocialActionRail renders save count (not hardcoded 0)', () => {
    const rail = readFileSync(
      join(process.cwd(), 'src/components/social/SocialActionRail.tsx'),
      'utf8'
    )
    expect(rail).toContain('saveCount')
    expect(rail).not.toMatch(/count=\{0\}/)
    expect(rail).toContain('count={saveCount}')
  })

  it('repository counts from social tables including saveCount; batch includes saveCount', () => {
    const repo = readFileSync(
      join(process.cwd(), 'src/services/social/socialGraphRepository.ts'),
      'utf8'
    )
    expect(repo).toContain('batchCountSocialEngagement')
    expect(repo).toContain('saveCount')
    expect(repo).toContain('Always count social tables')
    expect(repo).toMatch(/saveCount: eng\?\.saveCount/)
  })

  it('save/unsave APIs return authoritative counts', () => {
    const save = readFileSync(
      join(process.cwd(), 'src/app/api/social/article/save/route.ts'),
      'utf8'
    )
    const unsave = readFileSync(
      join(process.cwd(), 'src/app/api/social/article/unsave/route.ts'),
      'utf8'
    )
    expect(save).toContain('getArticleCounts')
    expect(unsave).toContain('getArticleCounts')
  })
})

describe('P18.3L static media composition', () => {
  it('uses blurred cover background + sharp full-bleed cover without solid mid fill', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('blur-2xl')
    expect(card).toContain('object-cover')
    expect(card).toContain('smart-feed-media-breathing')
    expect(card).toContain('line-clamp-2')
    expect(card).not.toContain('min-h-[28vh]')
  })
})

describe('P18.3L comments sheet visualViewport geometry', () => {
  it('pins overlay to visualViewport box without horizontal drift', () => {
    const sheet = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/CommentsBottomSheet.tsx'),
      'utf8'
    )
    expect(sheet).toContain('visualViewport')
    expect(sheet).toContain('offsetLeft')
    expect(sheet).toContain('offsetTop')
    expect(sheet).toContain('viewportBox')
    expect(sheet).toContain("transform: 'none'")
    expect(sheet).toContain('overflow-hidden')
    expect(sheet).toContain('z-[120]')
    expect(sheet).not.toContain('100vw')
  })
})

describe('P18.3L feed regression guards', () => {
  it('preserves P18.3FG spacers / windowing markers', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('smart-feed-spacer-before')
    expect(client).toContain('smart-feed-spacer-after')
    expect(client).toContain('windowStart')
    expect(client).toContain('prefetchThreshold')
  })
})
