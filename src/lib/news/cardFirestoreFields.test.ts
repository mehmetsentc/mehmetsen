import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { newsDocToPost } from '@/lib/newsMapper'
import { publicReadMetaFromPost } from '@/services/editorial/publicReadPolicy'
import { ARTICLE_SITEMAP_FIRESTORE_FIELDS } from '@/lib/sitemap/articleSitemap'
import { FEED_FS_FIELDS } from '@/services/feed/FeedCandidateService'
import {
  isArticleBodyField,
  NEWS_CARD_FIRESTORE_FIELDS,
  pickNewsCardFields,
} from './cardFirestoreFields'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('P1-D news card field projection', () => {
  const fullDoc = {
    title: 'Kart başlığı',
    slug: 'kart-basligi',
    status: 'published',
    publishedAt: '2026-09-30T10:00:00.000Z',
    createdAt: '2026-09-30T09:00:00.000Z',
    updatedAt: '2026-09-30T11:00:00.000Z',
    categoryId: 'gundem',
    city: 'Çanakkale',
    citySlug: 'canakkale',
    district: 'Biga',
    districtSlug: 'biga',
    authorId: 'editor-1',
    authorUsername: 'editor',
    authorDisplayName: 'Editör',
    aiEditorId: 'editor-canakkale',
    summary: 'Kısa özet',
    description: 'Kısa özet',
    coverImageUrl: 'https://cdn.example/cover.jpg',
    thumbnail: 'https://cdn.example/cover.jpg',
    visibility: 'public',
    publicationAuthority: 'editorial',
    publishedBy: 'desk',
    approvedBy: 'editor-1',
    aiAutoPublished: false,
    needsReview: false,
    needsAdminReview: false,
    seoNoindex: false,
    publisherType: 'newsroom',
    content: '<p>BODY HTML that must not be read on list queries</p>',
    htmlContent: '<article>FULL</article>',
    bodyBlocks: [{ type: 'paragraph', text: 'BODY' }],
  }

  it('projected newsDocToPost keeps card and public-read fields and drops the body', () => {
    const projected = pickNewsCardFields(fullDoc)
    for (const body of ['content', 'htmlContent', 'bodyBlocks']) {
      expect(projected).not.toHaveProperty(body)
      expect(isArticleBodyField(body)).toBe(true)
    }

    const post = newsDocToPost('doc-1', projected)
    expect(post).not.toBeNull()
    expect(post).toMatchObject({
      id: 'doc-1',
      title: 'Kart başlığı',
      slug: 'kart-basligi',
      categoryId: 'gundem',
      citySlug: 'canakkale',
      districtSlug: 'biga',
      authorId: 'editor-1',
      authorUsername: 'editor',
      authorDisplayName: 'Editör',
      aiEditorId: 'editor-canakkale',
      summary: 'Kısa özet',
      coverImageUrl: 'https://cdn.example/cover.jpg',
      publishedAt: '2026-09-30T10:00:00.000Z',
    })
    expect(post!.content).not.toContain('BODY')
    expect(post!.htmlContent).toBeUndefined()
    expect(post!.bodyBlocks ?? []).toEqual([])

    const policy = publicReadMetaFromPost(post!)
    expect(policy).toMatchObject({
      id: 'doc-1',
      title: 'Kart başlığı',
      status: 'published',
      slug: 'kart-basligi',
      visibility: 'public',
      publicationAuthority: 'editorial',
      publishedBy: 'desk',
      approvedBy: 'editor-1',
      authorId: 'editor-1',
      publisherType: 'newsroom',
    })
  })

  it('list loaders project cards; slug lookup and sitemaps do not read the body', () => {
    const news = read('src/services/newsService.server.ts')
    const category = read('src/services/categoryFirstPage.server.ts')
    expect(news).toContain('selectNewsCardFields')
    expect(category).toContain('selectNewsCardFields')
    expect(category).not.toContain('d.content')

    const slugStart = news.indexOf('export const getLegacyNewsBySlugCached')
    const slugEnd = news.indexOf('export async function getLegacyNewsBySlug')
    expect(news.slice(slugStart, slugEnd)).not.toContain('selectNewsCardFields')

    for (const field of ['content', 'contentHtml', 'htmlContent', 'body', 'bodyBlocks']) {
      expect(NEWS_CARD_FIRESTORE_FIELDS).not.toContain(field)
      expect(ARTICLE_SITEMAP_FIRESTORE_FIELDS).not.toContain(field)
      expect(FEED_FS_FIELDS).not.toContain(field)
    }
    expect(read('src/services/feed/FeedCandidateService.ts')).toContain('projectFeedQuery')
    expect(read('src/lib/sitemap/newsSitemapLoader.ts')).toContain('ARTICLE_SITEMAP_FIRESTORE_FIELDS')
  })
})
