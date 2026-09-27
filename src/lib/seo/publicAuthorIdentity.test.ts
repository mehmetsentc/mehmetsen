import { describe, expect, it } from 'vitest'
import type { Post } from '@/types/post'
import { buildNewsArticleJsonLd } from '@/lib/seo'
import {
  publicAuthorPath,
  publicAuthorUrl,
  resolvePublicAuthorIdentity,
} from '@/lib/seo/publicAuthorIdentity'

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
    createdAt: '2026-09-26T12:00:00.000Z',
    publishedAt: '2026-09-26T12:00:00.000Z',
    ...partial,
  } as Post
}

function authorOf(p: Post) {
  const ld = buildNewsArticleJsonLd(p)
  return ld.author as { '@type': string; name: string; url: string }
}

describe('public author identity', () => {
  it('keeps a real human as Person with one profile', () => {
    const p = post({})
    const identity = resolvePublicAuthorIdentity(p)
    const author = authorOf(p)
    expect(identity.type).toBe('Person')
    expect(identity.name).toBe('Ayşe Demir')
    expect(author['@type']).toBe('Person')
    expect(author.name).toBe(identity.name)
    expect(new URL(author.url).pathname).toBe(publicAuthorPath(identity))
    expect(author.url).toBe(publicAuthorUrl(identity, new URL(author.url).origin))
  })

  it('shows the editor name, not an AI desk label', () => {
    const p = post({
      authorId: 'ai_editor_il-izmir-yasam',
      authorUsername: 'il-izmir-yasam',
      authorDisplayName: 'Gökhan Çelik',
      aiEditorId: 'editor-izmir-yasam',
      authorIsAI: true,
      categoryId: 'yasam',
      citySlug: 'mugla',
      districtSlug: 'fethiye',
    })
    const identity = resolvePublicAuthorIdentity(p)
    const author = authorOf(p)
    expect(identity.type).toBe('Person')
    expect(identity.name).toBe('Gökhan Çelik')
    expect(identity.name).not.toMatch(/AI Editör|Masası/)
    expect(identity.aiDisclosure).toBe(false)
    expect(author['@type']).toBe('Person')
    expect(author.name).toBe(identity.name)
    expect(new URL(author.url).pathname).toBe('/yazar/il-izmir-yasam')
    expect(publicAuthorPath(identity)).toBe('/yazar/il-izmir-yasam')
  })

  it('does not attach an AI persona to /yazar/mehmetsentc', () => {
    const p = post({
      authorId: 'human-uid',
      authorUsername: 'mehmetsentc',
      authorDisplayName: 'Na Haber Editör',
      aiEditorId: 'editor-siyaset',
      authorIsAI: true,
      publicationAuthority: 'HUMAN_EDITOR',
      categoryId: 'siyaset',
    })
    const identity = resolvePublicAuthorIdentity(p)
    const author = authorOf(p)
    expect(author.url).not.toContain('/yazar/mehmetsentc')
    expect(publicAuthorPath(identity)).not.toContain('mehmetsentc')
    expect(identity.name).not.toBe('Mert Karaca')
    expect(identity.type).toBe('Organization')
    expect(author['@type']).toBe('Organization')
  })

  it('does not invent a persona for a generic CMS name without an AI desk slug', () => {
    const p = post({
      authorId: 'human-uid',
      authorUsername: 'mehmetsentc',
      authorDisplayName: 'Na Haber Editör',
      publicationAuthority: 'HUMAN_EDITOR',
    })
    const identity = resolvePublicAuthorIdentity(p)
    const author = authorOf(p)
    expect(identity.type).toBe('Organization')
    expect(identity.name).toBe('NaHaber')
    expect(author.url).not.toContain('mehmetsentc')
    expect(author.name).not.toMatch(/Karaca|Erdem|Koç/)
  })

  it('never emits a public /yazar/ai_editor_* URL', () => {
    const p = post({
      authorId: 'ai_editor_ulke-ukrayna',
      authorUsername: 'ai_editor_ulke-ukrayna',
      authorDisplayName: 'Andriy Kovalchuk',
      aiEditorId: 'editor-ukrayna',
      authorIsAI: true,
    })
    const identity = resolvePublicAuthorIdentity(p)
    const author = authorOf(p)
    expect(publicAuthorPath(identity)).toBe('/yazar/ulke-ukrayna')
    expect(author.url).not.toContain('ai_editor_')
    expect(identity.name).toBe('Andriy Kovalchuk')
  })

  it('does not treat HUMAN_EDITOR as the content author', () => {
    const p = post({
      authorId: 'ai_editor_ulke-iran',
      authorUsername: 'ulke-iran',
      authorDisplayName: 'Azadeh Kazemi',
      aiEditorId: 'editor-iran',
      authorIsAI: true,
      publicationAuthority: 'HUMAN_EDITOR',
    })
    const identity = resolvePublicAuthorIdentity(p)
    expect(identity.type).toBe('Person')
    expect(identity.name).toBe('Azadeh Kazemi')
    expect(identity.profileSlug).toBe('ulke-iran')
  })

  it('leaves the publisher as NaHaber NewsMediaOrganization', () => {
    const ld = buildNewsArticleJsonLd(
      post({
        authorUsername: 'il-eskisehir-asayis',
        authorId: 'ai_editor_il-eskisehir-asayis',
        authorDisplayName: 'Ebru Akkılıç',
        aiEditorId: 'desk',
        authorIsAI: true,
      })
    )
    expect(ld.publisher).toMatchObject({
      '@type': 'NewsMediaOrganization',
      name: 'NaHaber',
    })
  })
})
