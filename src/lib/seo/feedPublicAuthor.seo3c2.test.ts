import { describe, expect, it } from 'vitest'
import type { Post } from '@/types/post'
import { buildNewsArticleJsonLd } from '@/lib/seo'
import {
  publicAuthorPath,
  publicFeedAuthor,
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

function articleAuthor(p: Post) {
  const identity = resolvePublicAuthorIdentity(p)
  const ld = buildNewsArticleJsonLd(p).author as { '@type': string; name: string; url: string }
  return { identity, ld, path: publicAuthorPath(identity) }
}

function expectSameEntity(feed: { name: string; slug: string | null }, article: ReturnType<typeof articleAuthor>) {
  expect(feed.name).toBe(article.identity.name)
  expect(feed.slug).toBe(article.identity.profileSlug)
  if (article.identity.aiDisclosure) {
    // SEO-6: AI personas are disclosed; JSON-LD credits the newsroom, not a Person.
    expect(article.ld['@type']).toBe('Organization')
    expect(article.ld.name).toBe('NaHaber')
    expect(new URL(article.ld.url).pathname).toBe('/')
  } else {
    expect(article.ld.name).toBe(article.identity.name)
    expect(article.ld['@type']).toBe(article.identity.type)
    expect(new URL(article.ld.url).pathname).toBe(article.path)
  }
  if (feed.slug) {
    expect(article.path).toBe(`/yazar/${feed.slug}`)
    expect(feed.slug.includes('ai_editor_')).toBe(false)
    expect(feed.slug).not.toBe('mehmetsentc')
  } else {
    expect(article.path).toBe('/')
  }
}

describe('feed and article public author', () => {
  it('uses the city editor name on the feed when the card has no username', () => {
    const article = post({
      authorId: 'ai_editor_il-mardin-ekonomi',
      authorUsername: 'il-mardin-ekonomi',
      authorDisplayName: 'Burcu Kaya',
      aiEditorId: 'editor-mardin',
      authorIsAI: true,
      categoryId: 'ekonomi',
      citySlug: 'mardin',
    })
    const feed = publicFeedAuthor({
      authorDisplayName: 'Burcu Kaya',
      authorId: 'ai_editor_il-mardin-ekonomi',
      aiEditorId: 'editor-mardin',
    })
    expect(feed.name).toBe('Burcu Kaya')
    expect(feed.name).not.toMatch(/AI Editör|Masası/)
    expect(feed.slug).toBe('il-mardin-ekonomi')
    expect(feed.slug).not.toBe('yerel-kars')
    expectSameEntity(feed, articleAuthor(article))
  })

  it('uses the country editor name on the feed', () => {
    const article = post({
      authorId: 'ai_editor_ulke-ukrayna',
      authorUsername: 'ulke-ukrayna',
      authorDisplayName: 'Andriy Kovalchuk',
      aiEditorId: 'editor-ukrayna',
      authorIsAI: true,
    })
    const feed = publicFeedAuthor({
      authorDisplayName: 'Andriy Kovalchuk',
      authorId: 'ai_editor_ulke-ukrayna',
      aiEditorId: 'editor-ukrayna',
    })
    expect(feed.name).toBe('Andriy Kovalchuk')
    expect(feed.slug).toBe('ulke-ukrayna')
    expectSameEntity(feed, articleAuthor(article))
  })

  it('uses the national editor name when the feed row only has the legacy editor id', () => {
    const article = post({
      authorId: 'ai_editor_melis-kaya',
      authorUsername: 'melis-kaya',
      authorDisplayName: 'Melis Kaya',
      aiEditorId: 'ai_editor_melis-kaya',
      authorIsAI: true,
    })
    const feed = publicFeedAuthor({
      authorDisplayName: 'Melis Kaya',
      authorId: 'ai_editor_melis-kaya',
      aiEditorId: 'ai_editor_melis-kaya',
    })
    expect(feed.name).toBe('Melis Kaya')
    expect(feed.name).not.toMatch(/AI Editör/)
    expect(feed.slug).toBe('melis-kaya')
    expectSameEntity(feed, articleAuthor(article))
  })

  it('keeps a real human as the same Person on the feed, article, and JSON-LD', () => {
    const article = post({})
    const feed = publicFeedAuthor({
      authorDisplayName: 'Ayşe Demir',
      authorUsername: 'ayse-demir',
      authorId: 'uid-1',
    })
    expect(feed.name).toBe('Ayşe Demir')
    expect(feed.slug).toBe('ayse-demir')
    const rendered = articleAuthor(article)
    expect(rendered.identity.type).toBe('Person')
    expect(rendered.ld['@type']).toBe('Person')
    expectSameEntity(feed, rendered)
  })

  it('does not give a generic CMS editor a false human profile', () => {
    const article = post({
      authorId: 'wG8WTNIW38TILLvpDLsFmt6lMIg1',
      authorUsername: 'mehmetsentc',
      authorDisplayName: 'Na Haber Editör',
      aiEditorId: null,
      authorIsAI: false,
    })
    const feed = publicFeedAuthor({
      authorDisplayName: 'Na Haber Editör',
      authorUsername: 'mehmetsentc',
      authorId: 'wG8WTNIW38TILLvpDLsFmt6lMIg1',
    })
    expect(feed.name).toBe('NaHaber')
    expect(feed.slug).toBeNull()
    expect(feed.slug).not.toBe('mehmetsentc')
    expectSameEntity(feed, articleAuthor(article))
  })

  it('does not point an AI article stored as mehmetsentc at that profile', () => {
    const article = post({
      authorId: 'ai_editor_ece-yalin',
      authorUsername: 'mehmetsentc',
      authorDisplayName: 'Na Haber Editör',
      aiEditorId: 'editor-ece',
      authorIsAI: true,
      publicationAuthority: 'HUMAN_EDITOR',
    })
    const feed = publicFeedAuthor(article)
    expect(feed.slug).not.toBe('mehmetsentc')
    expect(feed.name).not.toBe('Ece Yalın')
    expectSameEntity(feed, articleAuthor(article))
  })

  it('strips a legacy ai_editor_ username from the public feed slug', () => {
    const article = post({
      authorId: 'ai_editor_ulke-ukrayna',
      authorUsername: 'ai_editor_ulke-ukrayna',
      authorDisplayName: 'Andriy Kovalchuk',
      aiEditorId: 'editor-ukrayna',
      authorIsAI: true,
    })
    const feed = publicFeedAuthor({
      authorDisplayName: article.authorDisplayName,
      authorUsername: 'ai_editor_ulke-ukrayna',
      authorId: article.authorId,
      aiEditorId: article.aiEditorId,
    })
    expect(feed.slug).toBe('ulke-ukrayna')
    expect(feed.slug?.includes('ai_editor_')).toBe(false)
    expectSameEntity(feed, articleAuthor(article))
  })
})
