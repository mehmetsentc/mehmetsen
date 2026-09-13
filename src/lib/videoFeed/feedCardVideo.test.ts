import { describe, expect, it } from 'vitest'
import { resolveFeedCardVideo, sanitizeFeedVideoUrl } from '@/lib/videoFeed/feedCardVideo'
import { feedScoringService } from '@/services/feed/FeedScoringService'
import type { FeedCandidateRow, FeedUserContext } from '@/types/smartFeed'

function row(
  partial: Partial<FeedCandidateRow> & Pick<FeedCandidateRow, 'articleId'>
): FeedCandidateRow {
  const now = new Date()
  return {
    clusterId: null,
    publisherId: null,
    publisherSlug: null,
    publisherName: null,
    publisherLogoUrl: null,
    headline: partial.headline ?? 'Test',
    summary: null,
    category: 'gundem',
    image: 'https://cdn.nahaber.com/img.jpg',
    video: null,
    publishedAt: now,
    updatedAt: now,
    breaking: false,
    materialUpdate: false,
    clusterSourceCount: 1,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    slug: partial.slug ?? partial.articleId,
    source: 'RECENT',
    sortScore: now.getTime(),
    ...partial,
  }
}

function ctx(): FeedUserContext {
  return {
    userId: 'u1',
    isSynthetic: false,
    explicitInterests: [],
    behavioralInterests: new Map(),
    publisherAffinities: new Map(),
    followedPublisherIds: new Set(),
    negativePreferences: [],
    city: null,
    districtSlug: null,
  }
}

describe('resolveFeedCardVideo', () => {
  it('accepts YouTube as embeddable feed video', () => {
    const resolved = resolveFeedCardVideo('https://www.youtube.com/watch?v=dQw4w9wgGcQ')
    expect(resolved).toEqual({
      kind: 'youtube',
      videoId: 'dQw4w9wgGcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
    })
  })

  it('accepts owned native mp4', () => {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/news-videos%2Fclip.mp4?alt=media'
    expect(resolveFeedCardVideo(url)?.kind).toBe('native')
  })

  it('rejects TTS/audio, HLS, malformed, and external mp4 hotlink', () => {
    expect(sanitizeFeedVideoUrl('https://evil.example/hot.mp4')).toBeNull()
    expect(sanitizeFeedVideoUrl('https://www.nahaber.com/media/live.m3u8')).toBeNull()
    expect(sanitizeFeedVideoUrl('not-a-url')).toBeNull()
    expect(sanitizeFeedVideoUrl('')).toBeNull()
    expect(sanitizeFeedVideoUrl(null)).toBeNull()
  })
})

describe('feed-v2 video mix — existing ranking, no splice', () => {
  it('articles and playable video-news keep identity and ranking order', () => {
    const now = Date.now()
    const articleA = row({
      articleId: 'a',
      headline: 'Article A',
      publishedAt: new Date(now),
      video: null,
    })
    const videoB = row({
      articleId: 'b',
      headline: 'Video B',
      publishedAt: new Date(now - 1_000),
      video: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
    })
    const articleC = row({
      articleId: 'c',
      headline: 'Article C',
      publishedAt: new Date(now - 2_000),
      video: null,
    })
    const videoD = row({
      articleId: 'd',
      headline: 'Video D',
      publishedAt: new Date(now - 3_000),
      video: 'https://www.youtube.com/watch?v=abcdefghijk',
    })

    const ranked = feedScoringService.scoreAll(
      [articleA, videoB, articleC, videoD],
      ctx(),
      'personal',
      new Set(),
      new Set()
    )
    expect(ranked.map((item) => item.articleId)).toEqual(['a', 'b', 'c', 'd'])
    expect(sanitizeFeedVideoUrl(videoB.video)).toBe(videoB.video)
    expect(sanitizeFeedVideoUrl(articleA.video)).toBeNull()

    const afterSeen = feedScoringService.scoreAll(
      [articleA, videoB, articleC, videoD],
      ctx(),
      'personal',
      new Set(['b']),
      new Set()
    )
    expect(afterSeen.map((item) => item.articleId)).toEqual(['a', 'c', 'd'])

    const withVideo = feedScoringService.scoreCandidate(videoB, ctx(), 'personal')
    const withoutVideo = feedScoringService.scoreCandidate(
      { ...videoB, video: null },
      ctx(),
      'personal'
    )
    expect(withVideo.score).toBe(withoutVideo.score)
    expect(withVideo.reason).toBe(withoutVideo.reason)
  })

  it('unplayable video URL does not drop the news identity — sanitizes to article fallback', () => {
    const broken = row({
      articleId: 'broken',
      video: 'https://cdn.untrusted.example/clip.mp4',
      image: 'https://cdn.nahaber.com/thumb.jpg',
    })
    expect(sanitizeFeedVideoUrl(broken.video)).toBeNull()
    expect(broken.articleId).toBe('broken')
    expect(broken.image).toBeTruthy()
  })
})
