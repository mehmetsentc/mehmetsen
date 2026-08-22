import { describe, expect, it } from 'vitest'
import { MemoryCrawlerStore } from '../store/memory'
import {
  AI_PUBLISH_BATCH_CAP,
  authorizeEditorAiPublish,
  buildNewsroomInputFromRaw,
  publishRawArticlesWithAi,
} from './aiPublish'
import type { InsertRawArticleInput } from '../store/types'

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
})
