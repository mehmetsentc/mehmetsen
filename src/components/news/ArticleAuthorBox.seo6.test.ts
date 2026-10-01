import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Post } from '@/types/post'
import { ArticleAuthorBox } from '@/components/news/ArticleAuthorBox'

;(globalThis as { React?: typeof React }).React = React

function post(partial: Partial<Post>): Post {
  return {
    id: 'p1',
    title: 'Deneme haber',
    slug: 'deneme-haber',
    content: 'Gövde',
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

const render = (p: Post) => renderToStaticMarkup(createElement(ArticleAuthorBox, { post: p }))

describe('SEO-6 P1 ArticleAuthorBox AI disclosure', () => {
  it('AI persona: keeps name + profile link and shows “NaHaber AI Editörü”', () => {
    const html = render(
      post({
        authorId: 'ai_editor_il-canakkale-gundem',
        authorUsername: 'il-canakkale-gundem',
        authorDisplayName: 'Lale Yurtseven',
        aiEditorId: 'editor-canakkale',
        authorIsAI: true,
      })
    )
    expect(html).toContain('Lale Yurtseven')
    expect(html).toContain('href="/yazar/il-canakkale-gundem"')
    expect(html).toContain('NaHaber AI Editörü')
  })

  it('human editor: no AI label', () => {
    const html = render(post({}))
    expect(html).toContain('Ayşe Demir')
    expect(html).toContain('href="/yazar/ayse-demir"')
    expect(html).not.toContain('AI Editör')
  })
})
