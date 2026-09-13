import { describe, expect, it } from 'vitest'
import type { Post } from '@/types/post'
import {
  pickVisualVideoRepresentative,
  selectVisualVideoWinner,
  suppressClusterDuplicates,
} from '@/lib/videoFeed/dedupVisualVideos'

function post(overrides: Partial<Post> & { videoUrl?: string; clusterId?: string | null; isTTS?: boolean } = {}): Post {
  const { videoUrl, clusterId, isTTS, ...rest } = overrides
  return {
    id: 'a',
    title: 'Başlık',
    slug: 'haber-a',
    content: 'Gövde metni yeterince uzun.',
    summary: 'Özet',
    authorId: 'nahaber',
    authorUsername: 'nahaber',
    authorDisplayName: 'NaHaber',
    authorPhotoURL: null,
    categoryId: 'gundem',
    tags: [],
    mediaItems: videoUrl
      ? [{ type: 'video', url: videoUrl, thumbnailUrl: null, caption: null }]
      : [],
    coverImageUrl: null,
    status: 'published',
    visibility: 'public',
    postType: 'news',
    source: 'ANKA',
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    isEditorPick: false,
    isTrending: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    publishedAt: '2026-01-01T00:00:00.000Z',
    ...rest,
    ...(videoUrl ? { videoUrl } : {}),
    ...(clusterId !== undefined ? { clusterId } : {}),
    ...(isTTS !== undefined ? { isTTS } : {}),
  } as Post
}

describe('visual video dedup', () => {
  it('keeps one representative for the same YouTube ID', () => {
    const first = post({
      id: 'old',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
      publishedAt: '2026-01-01T00:00:00.000Z',
      summary: '',
    })
    const richer = post({
      id: 'new',
      videoUrl: 'https://youtu.be/dQw4w9wgGcQ',
      publishedAt: '2026-02-01T00:00:00.000Z',
      summary: 'Daha zengin özet',
      coverImageUrl: 'https://i.ytimg.com/vi/dQw4w9wgGcQ/hqdefault.jpg',
    })
    const result = pickVisualVideoRepresentative([first, richer])
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('new')
  })

  it('dedups the same normalized playable URL', () => {
    const a = post({
      id: 'one',
      videoUrl: 'https://www.youtube.com/embed/abcdefghijk',
    })
    const b = post({
      id: 'two',
      videoUrl: 'https://youtube.com/embed/abcdefghijk?utm_source=rss',
    })
    const result = pickVisualVideoRepresentative([a, b])
    expect(result).toHaveLength(1)
  })

  it('keeps different videos even when they share an article family', () => {
    const a = post({
      id: 'yt-1',
      slug: 'haber-1',
      videoUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    })
    const b = post({
      id: 'yt-2',
      slug: 'haber-1-devam',
      videoUrl: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
    })
    const result = pickVisualVideoRepresentative([a, b])
    expect(result.map((item) => item.id).sort()).toEqual(['yt-1', 'yt-2'])
  })

  it('picks a deterministic winner on a tie', () => {
    const a = post({
      id: 'zeta',
      title: 'Aynı',
      videoUrl: 'https://www.youtube.com/watch?v=ccccccccccc',
      publishedAt: '2026-03-01T00:00:00.000Z',
    })
    const b = post({
      id: 'alpha',
      title: 'Aynı',
      videoUrl: 'https://www.youtube.com/watch?v=ccccccccccc',
      publishedAt: '2026-03-01T00:00:00.000Z',
    })
    expect(selectVisualVideoWinner([a, b]).id).toBe('alpha')
    expect(pickVisualVideoRepresentative([a, b])[0]?.id).toBe('alpha')
  })

  it('does not invent cluster suppression when clusterId is absent', () => {
    const result = suppressClusterDuplicates([
      post({ id: 'a', videoUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' }),
      post({ id: 'b', videoUrl: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' }),
    ])
    expect(result.clusterApplied).toBe(false)
    expect(result.posts).toHaveLength(2)
  })

  it('keeps one video per clusterId when the relation is present', () => {
    const result = suppressClusterDuplicates([
      post({
        id: 'older',
        clusterId: 'cluster-1',
        videoUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        publishedAt: '2026-01-01T00:00:00.000Z',
      }),
      post({
        id: 'newer',
        clusterId: 'cluster-1',
        videoUrl: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
        publishedAt: '2026-04-01T00:00:00.000Z',
        coverImageUrl: 'https://example.com/thumb.jpg',
      }),
    ])
    expect(result.clusterApplied).toBe(true)
    expect(result.posts).toHaveLength(1)
    expect(result.posts[0]?.id).toBe('newer')
  })
})
