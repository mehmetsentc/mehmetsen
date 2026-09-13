import { describe, expect, it } from 'vitest'
import { hasVideoContent } from '@/lib/postUtils'
import type { Post } from '@/types/post'
import {
  finalizeVideoFeedPosts,
  shouldUseTtsVideoFallback,
} from '@/lib/videoFeed/selectVideoFeedPosts'

function post(overrides: Partial<Post> & { videoUrl?: string; isTTS?: boolean } = {}): Post {
  const { videoUrl, isTTS, ...rest } = overrides
  return {
    id: 'n1',
    title: 'Haber',
    slug: 'haber',
    content: 'Gövde',
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
    coverImageUrl: 'https://example.com/cover.jpg',
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
    ...(isTTS !== undefined ? { isTTS } : {}),
  } as Post
}

describe('video feed surface selection', () => {
  it('keeps /reels audio-like content via hasVideoContent', () => {
    const audio = post({
      id: 'tts',
      audioUrl: 'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/tts.mp3?alt=media',
      isTTS: true,
    })
    expect(hasVideoContent(audio)).toBe(true)
    const reels = finalizeVideoFeedPosts([audio], 'reels')
    expect(reels).toHaveLength(1)
    expect(reels[0]?.id).toBe('tts')
  })

  it('makes /video visual-only and drops TTS/audio', () => {
    const audio = post({
      id: 'tts',
      audioUrl: 'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/tts.mp3?alt=media',
      isTTS: true,
    })
    const visual = post({
      id: 'yt',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9wgGcQ',
    })
    const video = finalizeVideoFeedPosts([audio, visual], 'video')
    expect(video.map((item) => item.id)).toEqual(['yt'])
  })

  it('forbids TTS collection fallback on /video and preserves it for /reels', () => {
    expect(shouldUseTtsVideoFallback('video', 0, false)).toBe(false)
    expect(shouldUseTtsVideoFallback('reels', 0, false)).toBe(true)
    expect(shouldUseTtsVideoFallback('reels', 1, false)).toBe(false)
    expect(shouldUseTtsVideoFallback('reels', 0, true)).toBe(false)
  })
})
