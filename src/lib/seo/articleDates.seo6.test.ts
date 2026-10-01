import { describe, expect, it } from 'vitest'
import type { Post } from '@/types/post'
import { buildNewsArticleJsonLd, buildPostMetadata } from '@/lib/seo'
import { articleDateModified } from '@/lib/postUtils'

const PUBLISHED = '2026-09-26T12:00:00.000Z'

function post(partial: Partial<Post>): Post {
  return {
    id: 'p1',
    title: 'Deneme haber',
    slug: 'deneme-haber',
    content: 'Gövde metni yeterli uzunlukta bir haber.',
    summary: 'Özet',
    authorId: 'uid-1',
    authorUsername: 'ayse-demir',
    authorDisplayName: 'Ayşe Demir',
    authorPhotoURL: null,
    categoryId: 'gundem',
    tags: [],
    mediaItems: [],
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
    createdAt: '2026-09-26T10:00:00.000Z',
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    ...partial,
  } as Post
}

function modified(p: Post) {
  const ld = buildNewsArticleJsonLd(p)
  const meta = buildPostMetadata(p) as {
    openGraph?: { modifiedTime?: string; publishedTime?: string }
    other?: Record<string, string>
  }
  return {
    ld: ld.dateModified,
    og: meta.openGraph?.modifiedTime,
    meta: meta.other?.['article:modified_time'],
  }
}

describe('SEO-6 P2.1 dateModified = max(updatedAt, publishedAt)', () => {
  it('updatedAt before publishedAt (scheduled/created earlier) → publishedAt', () => {
    const m = modified(post({ updatedAt: '2026-09-26T11:00:00.000Z' }))
    expect(m).toEqual({ ld: PUBLISHED, og: PUBLISHED, meta: PUBLISHED })
  })

  it('updatedAt after publishedAt → updatedAt', () => {
    const later = '2026-09-27T08:30:00.000Z'
    expect(modified(post({ updatedAt: later }))).toEqual({ ld: later, og: later, meta: later })
  })

  it('missing or invalid updatedAt → publishedAt; missing publishedAt → createdAt baseline', () => {
    expect(articleDateModified(post({ updatedAt: '' }))).toBe(PUBLISHED)
    expect(articleDateModified(post({ updatedAt: 'not-a-date' }))).toBe(PUBLISHED)
    expect(
      articleDateModified(post({ publishedAt: null, updatedAt: '2026-09-26T09:00:00.000Z' }))
    ).toBe('2026-09-26T10:00:00.000Z')
  })

  it('dateModified is never earlier than datePublished', () => {
    const ld = buildNewsArticleJsonLd(post({ updatedAt: '2020-01-01T00:00:00.000Z' }))
    expect(Date.parse(String(ld.dateModified))).toBeGreaterThanOrEqual(
      Date.parse(String(ld.datePublished))
    )
  })
})
