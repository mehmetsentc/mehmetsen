/**
 * P18.3N — identity collapse, followable publisher gate, client overlap.
 */
import { describe, expect, it } from 'vitest'
import {
  feedItemIdentityKeys,
  feedItemsOverlap,
  isFollowablePublisherId,
} from '@/lib/feed/feedIdentity'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('P18.3N feed identity helpers', () => {
  it('rejects AI author / system ids as follow targets', () => {
    expect(isFollowablePublisherId('ai_editor_kerem-aydin')).toBe(false)
    expect(isFollowablePublisherId('nahaber')).toBe(false)
    expect(isFollowablePublisherId('source')).toBe(false)
    expect(isFollowablePublisherId('')).toBe(false)
    expect(isFollowablePublisherId('sozcu')).toBe(true)
    expect(isFollowablePublisherId('src_abc')).toBe(true)
  })

  it('overlap treats same slug/cluster as one story', () => {
    expect(
      feedItemsOverlap(
        { articleId: 'pg-1', slug: 'story-a', clusterId: 'c1' },
        { articleId: 'fs-9', slug: 'story-a', clusterId: null }
      )
    ).toBe(true)
    expect(
      feedItemsOverlap(
        { articleId: 'a', clusterId: 'c1' },
        { articleId: 'b', clusterId: 'c1' }
      )
    ).toBe(true)
    expect(feedItemsOverlap({ articleId: 'a' }, { articleId: 'b' })).toBe(false)
    expect(feedItemIdentityKeys({ articleId: 'a', slug: 's', clusterId: 'c' })).toEqual([
      'a',
      's',
      'cluster:c',
    ])
  })

  it('candidate + pipeline expand ranked/session excludes and never use authorId as publisher', () => {
    const candidate = readFileSync(
      join(process.cwd(), 'src/services/feed/FeedCandidateService.ts'),
      'utf8'
    )
    expect(candidate).toContain('canonicalizeFirestoreRows')
    expect(candidate).toContain('expandArticleIdentities')
    expect(candidate).toContain('ingestionSourceId')
    expect(candidate).not.toMatch(/publisherId: data\.sourceId \|\| data\.authorId/)
    expect(candidate).not.toMatch(/news\.authorId\)/)

    const pipeline = readFileSync(
      join(process.cwd(), 'src/services/feed/FeedRankingPipeline.ts'),
      'utf8'
    )
    expect(pipeline).toContain('expandArticleIdentities')
  })

  it('scroll geometry uses locked --feed-card-h token', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('--feed-card-h')
    expect(client).toContain('visualViewport')
    expect(client).toContain('programmaticScrollRef')
    expect(client).toContain('feedItemsOverlap')
  })
})
