import { describe, expect, it } from 'vitest'
import { buildVideoFeedOrder, dedupeVideoPool, isVideoTabMatch } from './rankedVideoFeed'
import { feedItemToVideoPost, seenLastStable } from './feedItemToVideoPost'
import type { FeedItemDto } from '@/types/smartFeed'

const row = (id: string, day: number, video: string | null = `https://storage.googleapis.com/b/videos/${id}.mp4`, extra = {}) => ({
  articleId: id,
  video,
  publishedAt: new Date(Date.UTC(2026, 10, day)),
  category: 'gundem' as string | null,
  citySlug: null as string | null,
  ...extra,
})

describe('VIDEO-RANK-1 /video order', () => {
  it('keeps the ranker order, then appends everything it skipped (newest first)', async () => {
    const pool = [row('a', 1), row('b', 5), row('c', 3), row('d', 4)]
    const out = await buildVideoFeedOrder(pool, async () => ({
      ranked: [{ articleId: 'c' }, { articleId: 'a' }, { articleId: 'zz-not-in-pool' }],
      rankingVersion: 'NFRANK_V1',
    }))
    expect(out.ids).toEqual(['c', 'a', 'b', 'd'])
    expect(out.rankingVersion).toBe('NFRANK_V1')
  })

  it('falls back to newest first when the ranker throws', async () => {
    const out = await buildVideoFeedOrder([row('a', 1), row('b', 5)], async () => {
      throw new Error('db down')
    })
    expect(out.ids).toEqual(['b', 'a'])
    expect(out.rankingVersion).toBe('recency_fallback')
  })

  it('drops rows without video and repeats of the same story or file', () => {
    const shared = 'https://storage.googleapis.com/b/videos/same.mp4?token=1'
    const rows = dedupeVideoPool([
      row('a', 1, shared),
      row('b', 2, shared.replace('token=1', 'token=2')),
      row('a', 3),
      row('n', 4, null),
    ])
    // newest first: n has no video, a(day 3) kept, b(day 2) kept, a(day 1) is the same story
    expect(rows.map((r) => r.articleId)).toEqual(['a', 'b'])
    expect(dedupeVideoPool([row('x', 2, shared), row('y', 1, shared)]).map((r) => r.articleId)).toEqual(['x'])
  })

  it('tab filter: Sana Özel all, Yerel = city stories, others = category family', () => {
    expect(isVideoTabMatch({ category: 'spor', citySlug: null }, null, null)).toBe(true)
    expect(isVideoTabMatch({ category: 'asayis', citySlug: 'canakkale' }, 'yerel-haber', ['yerel-haber'])).toBe(true)
    expect(isVideoTabMatch({ category: 'asayis', citySlug: null }, 'yerel-haber', ['yerel-haber'])).toBe(false)
    expect(isVideoTabMatch({ category: 'gundem', citySlug: null }, 'gundem', ['gundem'])).toBe(true)
    expect(isVideoTabMatch({ category: 'spor', citySlug: null }, 'gundem', ['gundem'])).toBe(false)
  })

  it('maps a Feed V2 card to a playable video post and keeps rank order for unseen', () => {
    const item = {
      id: 'x', type: 'article', articleId: 'x', clusterId: null, publisher: null, headline: 'Başlık',
      summary: 'Özet', category: 'gundem', image: 'https://img/x.jpg',
      video: 'https://storage.googleapis.com/b/videos/x.mp4', publishedAt: '2026-11-25T08:00:00.000Z',
      updatedAt: '2026-11-25T08:00:00.000Z', breaking: false, materialUpdate: false, clusterSourceCount: 1,
      socialState: null, socialCounts: { likes: 2, comments: 0, saves: 0, shares: 0, views: 9 },
      reason: 'RECENT', slug: 'baslik', sourceName: 'NaHaber',
    } as unknown as FeedItemDto
    const post = feedItemToVideoPost(item)!
    expect(post.videoUrl).toBe(item.video)
    expect(post.mediaItems[0]).toMatchObject({ type: 'video', url: item.video })
    expect(post.slug).toBe('baslik')
    expect(feedItemToVideoPost({ ...item, video: null })).toBeNull()
    expect(seenLastStable([{ id: '1' }, { id: '2' }, { id: '3' }], new Set(['1'])).map((p) => p.id)).toEqual(['2', '3', '1'])
  })
})
