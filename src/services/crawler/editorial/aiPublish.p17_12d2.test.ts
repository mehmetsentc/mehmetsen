import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCrawlerStore } from '../store/memory'
import { publishRawArticleWithAi } from './aiPublish'
import type { InsertRawArticleInput } from '../store/types'

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: false,
          id: 'news_mock',
          data: () => ({}),
        }),
      }),
    }),
  }),
}))

vi.mock('./newsLink', () => ({
  syncCrawlerEditorial: vi.fn(async () => {}),
}))

vi.mock('@/services/rss/articleFetcher', () => ({
  fetchArticleEnrichment: vi.fn(async () => null),
}))

const NOW = new Date('2026-08-19T12:00:00Z')
const RICH_BODY =
  'Habertürk kaynaklı uzun haber gövdesi. Ekipler bölgede müdahale etti. ' +
  'Yetkililer açıklama yaptı ve gelişmeleri aktardı. '.repeat(18)

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

async function seedArticle(
  store: MemoryCrawlerStore,
  source: { id: string; domain: string },
  title: string,
  opts?: Partial<InsertRawArticleInput>
) {
  return store.insertRawArticle({
    sourceId: source.id,
    discoveredUrlId: null,
    originalUrl: `https://${source.domain}/${title}`,
    normalizedUrl: `https://${source.domain}/${title}`,
    canonicalUrl: `https://${source.domain}/${title}`,
    urlHash: title,
    title,
    description: title,
    articleBodyText: opts?.articleBodyText ?? `${title} ${RICH_BODY}`,
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

describe('P17.12D2 publishRawArticleWithAi human-path gates', () => {
  beforeEach(() => {
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'false')
    vi.stubEnv('LEGACY_DIRECT_AI_ENABLED', 'false')
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'false')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('manual=false denies without calling pipeline (crawler flag irrelevant)', async () => {
    const processArticleMock = vi.fn()
    const mockStore = {
      getRawArticle: vi.fn(),
      getSource: vi.fn(),
    } as any

    const result = await publishRawArticleWithAi({
      store: mockStore,
      rawArticleId: 'raw_test_123',
      processArticle: processArticleMock,
    })

    expect(result.outcome).toBe('skipped')
    expect(result.error).toContain('MANUAL_EDITOR_AI_ENABLED=false')
    expect(mockStore.getRawArticle).not.toHaveBeenCalled()
    expect(processArticleMock).not.toHaveBeenCalled()
  })

  it('manual=true + crawler=false reaches mocked processArticle', async () => {
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'true')
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store)
    const article = await seedArticle(store, source, 'manual-bulk')
    const processArticleMock = vi.fn().mockResolvedValue({
      outcome: 'skipped',
      skipReason: 'ai_unavailable',
    })

    const result = await publishRawArticleWithAi({
      store,
      rawArticleId: article.id,
      processArticle: processArticleMock as never,
    })

    expect(processArticleMock).toHaveBeenCalledTimes(1)
    const opts = processArticleMock.mock.calls[0]?.[2]
    expect(opts?.skipStoryLibraryDedupe).toBe(true)
    expect(result.outcome).toBe('skipped')
  })
})
