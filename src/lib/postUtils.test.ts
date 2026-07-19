import { describe, expect, it } from 'vitest'
import { getPostDetailHref, isReelsVideoPost } from '@/lib/postUtils'
import type { Post } from '@/types/post'

function basePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'abc',
    title: 'Başlık',
    slug: 'ornek-haber',
    content: 'Bu haberin yeterince uzun bir gövde metni vardır ve okuyucuya bağlam sunar.',
    summary: 'Özet',
    authorId: 'u1',
    authorUsername: 'nahaber',
    authorDisplayName: 'NaHaber',
    authorPhotoURL: null,
    categoryId: 'gundem',
    tags: [],
    mediaItems: [{
      type: 'video',
      url: 'https://cdn.example.com/clip.mp4',
      thumbnailUrl: null,
      caption: null,
    }],
    coverImageUrl: null,
    status: 'published',
    visibility: 'public',
    postType: 'news',
    source: 'NaHaber',
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    isEditorPick: false,
    isTrending: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    publishedAt: '2026-01-01',
    ...overrides,
  } as Post
}

describe('getPostDetailHref', () => {
  it('opens news articles with video on /haber/[slug]', () => {
    const post = basePost()
    expect(isReelsVideoPost(post)).toBe(false)
    expect(getPostDetailHref(post)).toBe('/haber/ornek-haber')
  })

  it('keeps dedicated video posts on Teve/reels', () => {
    const post = basePost({
      postType: 'video',
      slug: 'video-xyz',
      content: 'Kısa',
    })
    expect(isReelsVideoPost(post)).toBe(true)
    expect(getPostDetailHref(post)).toBe('/reels?v=abc')
  })
})
