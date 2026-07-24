import { describe, expect, it } from 'vitest'
import { slimNewsItemForFeed } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

describe('slimNewsItemForFeed', () => {
  it('keeps card fields and drops source/url/engagement noise', () => {
    const item: NewsItem = {
      id: '1',
      slug: 'haber-1',
      title: 'Başlık',
      description: 'x'.repeat(200),
      content: 'uzun gövde',
      readingMinutes: 3,
      imageUrl: 'https://storage.googleapis.com/bucket/a.jpg',
      videoUrl: 'https://example.com/v.mp4',
      category: 'gundem',
      source: 'Kaynak',
      author: 'Yazar',
      url: 'https://example.com/original',
      city: 'İstanbul',
      locationCity: 'İstanbul',
      province: 'İstanbul',
      createdAt: '2026-07-20T10:00:00.000Z',
      publishedAt: '2026-07-20T11:00:00.000Z',
      views: 12,
      likesCount: 3,
      commentsCount: 1,
      featured: false,
      breaking: true,
    }

    const slim = slimNewsItemForFeed(item)

    expect(slim).toEqual({
      id: '1',
      slug: 'haber-1',
      title: 'Başlık',
      description: 'x'.repeat(120),
      readingMinutes: 3,
      imageUrl: 'https://storage.googleapis.com/bucket/a.jpg',
      videoUrl: 'https://example.com/v.mp4',
      category: 'gundem',
      publishedAt: '2026-07-20T11:00:00.000Z',
      views: 12,
      breaking: true,
    })
    expect(slim).not.toHaveProperty('source')
    expect(slim).not.toHaveProperty('url')
    expect(slim).not.toHaveProperty('likesCount')
    expect(slim).not.toHaveProperty('featured')
    expect(slim).not.toHaveProperty('createdAt')
  })

  it('falls back publishedAt from createdAt', () => {
    const slim = slimNewsItemForFeed({
      id: '2',
      slug: 'h2',
      title: 'T',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect(slim.publishedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
