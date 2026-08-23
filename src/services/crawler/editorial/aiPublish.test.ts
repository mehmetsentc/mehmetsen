import { describe, expect, it, vi } from 'vitest'
import { MemoryCrawlerStore } from '../store/memory'
import {
  AI_PUBLISH_BATCH_CAP,
  authorizeEditorAiPublish,
  buildNewsroomInputFromRaw,
  isRawArticleAiPublishEligible,
  publishRawArticlesWithAi,
} from './aiPublish'
import type { InsertRawArticleInput } from '../store/types'

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          id: 'news_mock',
          data: () => ({ status: 'published', slug: 'mock-slug' }),
        }),
      }),
    }),
  }),
}))

vi.mock('./newsLink', () => ({
  syncCrawlerEditorial: vi.fn(async () => {}),
}))

const NOW = new Date('2026-08-19T12:00:00Z')

async function seedSource(store: MemoryCrawlerStore, name = 'AA') {
  return store.insertSource({
    name,
    domain: `${name.toLowerCase()}.test`,
    baseUrl: `https://${name.toLowerCase()}.test`,
    countryCode: 'TR',
    language: 'tr',
    city: 'Çanakkale',
  })
}

async function seedArticle(store: MemoryCrawlerStore, source: { id: string; domain: string }, title: string, opts?: Partial<InsertRawArticleInput>) {
  return store.insertRawArticle({
    sourceId: source.id,
    discoveredUrlId: null,
    originalUrl: `https://${source.domain}/${title}`,
    normalizedUrl: `https://${source.domain}/${title}`,
    canonicalUrl: `https://${source.domain}/${title}`,
    urlHash: title,
    title,
    description: title,
    articleBodyText: `${title} gövde metni yeterince uzun bir haber içeriği.`,
    articleBodyHtml: `<p>${title}</p>`,
    author: null,
    publishedAt: NOW,
    modifiedAt: null,
    language: 'tr',
    countryCode: 'TR',
    region: null,
    city: 'Çanakkale',
    district: null,
    mainImageUrl: null,
    imageUrls: [],
    videoUrls: [],
    wordCount: 120,
    charCount: 400,
    paragraphCount: 2,
    extractionConfidence: 0.9,
    qualityStatus: 'EXTRACTED',
    isExactDuplicate: 0,
    editorialStatus: 'NEW',
    ...opts,
  } as InsertRawArticleInput)
}

describe('authorizeEditorAiPublish', () => {
  it('requires news:publish', () => {
    expect(authorizeEditorAiPublish('author').ok).toBe(false)
    expect(authorizeEditorAiPublish('super_admin').ok).toBe(true)
  })
})

describe('buildNewsroomInputFromRaw', () => {
  it('maps local city to local-news editor', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store)
    const article = await seedArticle(store, source, 'yerel-haber', { city: 'Çanakkale' })
    const input = buildNewsroomInputFromRaw(article, source)
    expect(input.editorId).toBe('local-news')
    expect(input.rssGuid).toBe(article.id)
    expect(input.rssFingerprint).toContain('crawler-editor:')
  })

  it('uses national editor when no city slug', async () => {
    const store = new MemoryCrawlerStore()
    const source = await store.insertSource({
      name: 'Reuters',
      domain: 'reuters.test',
      baseUrl: 'https://reuters.test',
      countryCode: 'US',
      language: 'en',
      city: null,
    })
    const article = await seedArticle(store, source, 'world', { city: null, countryCode: 'US' })
    const input = buildNewsroomInputFromRaw(article, source)
    expect(input.editorId).toBe('national-news')
  })
})

describe('publishRawArticlesWithAi batch', () => {
  it('reports crawler dispatch off for empty batch', async () => {
    const store = new MemoryCrawlerStore()
    const result = await publishRawArticlesWithAi({ store, ids: [] })
    expect(result.requested).toBe(0)
    expect(result.crawlerDispatchEnabled).toBe(false)
  })

  it('exposes batch cap constant', () => {
    expect(AI_PUBLISH_BATCH_CAP).toBe(25)
  })

  it('attempts every selected article and passes skipStoryLibraryDedupe', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store)
    const articles = await Promise.all(
      Array.from({ length: 8 }, (_, i) => seedArticle(store, source, `bulk-haber-${i + 1}`))
    )
    const ids = articles.map((a) => a.id)
    const attempted: Array<{ id: string; skipDedupe?: boolean }> = []
    const processArticle = async (
      _db: unknown,
      input: { rssGuid?: string },
      options?: { skipStoryLibraryDedupe?: boolean }
    ) => {
      attempted.push({ id: String(input.rssGuid), skipDedupe: options?.skipStoryLibraryDedupe })
      return { outcome: 'published' as const, newsId: `news_${input.rssGuid}` }
    }

    const result = await publishRawArticlesWithAi({
      store,
      ids,
      processArticle: processArticle as never,
    })

    expect(attempted).toHaveLength(8)
    expect(new Set(attempted.map((a) => a.id))).toEqual(new Set(ids))
    expect(attempted.every((a) => a.skipDedupe === true)).toBe(true)
    expect(result.requested).toBe(8)
    expect(result.published).toBe(8)
    expect(result.failed).toBe(0)
    expect(result.results).toHaveLength(8)
  })

  it('continues batch after a per-item failure', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store)
    const articles = await Promise.all(
      Array.from({ length: 3 }, (_, i) => seedArticle(store, source, `fail-haber-${i + 1}`))
    )
    const ids = articles.map((a) => a.id)
    let call = 0
    const processArticle = async () => {
      call += 1
      if (call === 2) return { outcome: 'failed' as const }
      return { outcome: 'published' as const, newsId: `news_${call}` }
    }

    const result = await publishRawArticlesWithAi({
      store,
      ids,
      processArticle: processArticle as never,
    })

    expect(result.results).toHaveLength(3)
    expect(result.published).toBe(2)
    expect(result.failed).toBe(1)
  })
})

describe('isRawArticleAiPublishEligible', () => {
  it('allows active-queue statuses except PUBLISHED and DELETED', () => {
    expect(isRawArticleAiPublishEligible('NEW')).toBe(true)
    expect(isRawArticleAiPublishEligible('AI_CANDIDATE')).toBe(true)
    expect(isRawArticleAiPublishEligible('IN_REVIEW')).toBe(true)
    expect(isRawArticleAiPublishEligible('PUBLISHED')).toBe(false)
    expect(isRawArticleAiPublishEligible('DELETED')).toBe(false)
  })
})
