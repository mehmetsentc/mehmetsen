import { describe, expect, it } from 'vitest'
import { canonicalRowToPost, type CanonicalNewsRow } from './canonicalEligibility'
import { hasVideoContent } from '@/lib/postUtils'

// ARTICLE-VIDEO-1: the Postgres article row keeps the CMS video.
const base: CanonicalNewsRow = {
  id: 'n1', legacyFirestoreId: 'n1', slug: 'hindistan-video', title: 'Başlık',
  summary: 'Özet', description: 'Açıklama', content: 'İçerik', htmlContent: null,
  status: 'published', categoryId: 'dunya', citySlug: null, cityName: null,
  districtSlug: null, districtName: null, authorId: 'nahaber', authorDisplayName: 'NaHaber',
  source: 'NaHaber', sourceUrl: null,
  thumbnailUrl: 'https://cdn.nahaber.com/kapak.jpg', coverImageUrl: 'https://cdn.nahaber.com/kapak.jpg',
  videoUrl: 'https://storage.googleapis.com/nahaberapp.firebasestorage.app/videos/news/abc.mp4',
  tags: [], isBreaking: false, isFeatured: false, isEditorPick: false,
  seoTitle: null, seoDescription: null,
  publishedAt: new Date('2026-10-22T10:00:00Z'), createdAt: new Date('2026-10-22T09:00:00Z'), updatedAt: new Date('2026-10-22T10:00:00Z'),
} as unknown as CanonicalNewsRow

describe('ARTICLE-VIDEO-1 canonical row video', () => {
  it('keeps cover image first and adds the video item (article page shows the play button)', () => {
    const post = canonicalRowToPost(base)
    expect(post.mediaItems.map((m) => m.type)).toEqual(['image', 'video'])
    expect(post.mediaItems[1].url).toBe(base.videoUrl)
    expect(post.mediaItems[1].thumbnailUrl).toBe('https://cdn.nahaber.com/kapak.jpg')
    expect(hasVideoContent(post)).toBe(true)
  })

  it('video without a cover still becomes the hero item', () => {
    const post = canonicalRowToPost({ ...base, thumbnailUrl: null, coverImageUrl: null } as CanonicalNewsRow)
    expect(post.mediaItems.map((m) => m.type)).toEqual(['video'])
  })

  it('no video → image only, as before', () => {
    const post = canonicalRowToPost({ ...base, videoUrl: '  ' } as CanonicalNewsRow)
    expect(post.mediaItems.map((m) => m.type)).toEqual(['image'])
    expect(post.postType).toBe('news')
  })
})

describe('ARTICLE-VIDEO-1 VideoObject', () => {
  it('emits a VideoObject for the canonical video without a made-up duration', async () => {
    const { buildVideoObjectJsonLd } = await import('@/lib/seo')
    const ld = buildVideoObjectJsonLd(canonicalRowToPost(base))
    expect(ld?.['@type']).toBe('VideoObject')
    expect(ld?.contentUrl).toBe(base.videoUrl)
    expect(ld).not.toHaveProperty('duration')
  })
})
