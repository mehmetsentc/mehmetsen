import { describe, expect, it, vi } from 'vitest'
import { MemoryCrawlerStore } from '../store/memory'
import {
  AI_PUBLISH_BATCH_CAP,
  authorizeEditorAiPublish,
  buildNewsroomInputFromRaw,
  enrichThinBodyForEditorAi,
  isRawArticleAiPublishEligible,
  publishRawArticlesWithAi,
} from './aiPublish'
import { AI_PUBLISH_TIMEOUT_SKIP_TR } from './aiPublishEligibility'
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

  it('maps empty skipReason to Turkish detail instead of vague mükerrer toast', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store)
    const article = await seedArticle(store, source, 'skip-neden')
    const processArticle = async () => ({ outcome: 'skipped' as const })

    const result = await publishRawArticlesWithAi({
      store,
      ids: [article.id],
      processArticle: processArticle as never,
    })

    expect(result.skipped).toBe(1)
    expect(result.results[0]?.error).toContain('Atlandı:')
    expect(result.results[0]?.error).not.toContain('mükerrer veya filtre')
  })

  it('surfaces already_published with clear Turkish message', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store)
    const article = await seedArticle(store, source, 'zaten-yayin')
    const processArticle = async () => ({
      outcome: 'skipped' as const,
      skipReason: 'already_published',
      newsId: 'news_existing',
    })

    const result = await publishRawArticlesWithAi({
      store,
      ids: [article.id],
      processArticle: processArticle as never,
    })

    expect(result.results[0]?.outcome).toBe('already_published')
    expect(result.results[0]?.error).toContain('zaten yayınlanmış')
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

  it('stops before wall-clock budget and marks remaining as skipped', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store)
    const articles = await Promise.all(
      Array.from({ length: 4 }, (_, i) => seedArticle(store, source, `budget-haber-${i + 1}`))
    )
    const ids = articles.map((a) => a.id)

    let now = 1_000_000
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    let call = 0
    const processArticle = async () => {
      call += 1
      now += 60 // exceed 50ms budget before the next loop check
      return { outcome: 'published' as const, newsId: `news_${call}` }
    }

    try {
      const result = await publishRawArticlesWithAi({
        store,
        ids,
        processArticle: processArticle as never,
        budgetMs: 50,
        concurrency: 1,
      })

      expect(result.results).toHaveLength(4)
      expect(result.published).toBe(1)
      expect(result.skipped).toBe(3)
      expect(result.results.filter((r) => r.error === AI_PUBLISH_TIMEOUT_SKIP_TR)).toHaveLength(3)
    } finally {
      spy.mockRestore()
    }
  })

  it('processes batch with bounded concurrency', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store)
    const articles = await Promise.all(
      Array.from({ length: 8 }, (_, i) => seedArticle(store, source, `concurrency-haber-${i + 1}`))
    )
    const ids = articles.map((a) => a.id)

    let activeWorkers = 0
    let maxActiveWorkers = 0

    const processArticle = async () => {
      activeWorkers += 1
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers)
      await new Promise((r) => setTimeout(r, 10))
      activeWorkers -= 1
      return { outcome: 'published' as const, newsId: 'news_concurrent' }
    }

    const result = await publishRawArticlesWithAi({
      store,
      ids,
      processArticle: processArticle as never,
      concurrency: 3,
    })

    expect(result.results).toHaveLength(8)
    expect(result.published).toBe(8)
    expect(maxActiveWorkers).toBeLessThanOrEqual(3)
    expect(maxActiveWorkers).toBeGreaterThan(1)
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

describe('enrichThinBodyForEditorAi', () => {
  it('re-fetches and persists body when RSS snippet is too short', async () => {
    const { fetchArticleEnrichment } = await import('@/services/rss/articleFetcher')
    vi.mocked(fetchArticleEnrichment).mockResolvedValueOnce({
      imageUrl: 'https://im.haberturk.com/cover.jpg',
      description: null,
      bodyText: RICH_BODY + ' Ek paragraf kaynak siteden geldi.',
      htmlBody: `<p>${RICH_BODY}</p>`,
      author: null,
      publishedAt: null,
      readingTimeMinutes: 2,
      extractionMethod: 'test',
    })

    const store = new MemoryCrawlerStore()
    const source = await seedSource(store, 'Haberturk')
    const snippet =
      "Muğla'nın Bodrum ilçesinde etkisini artıran sıcak hava dalgası nedeniyle hissedilen sıcaklık 45 dereceye kadar çıktı."
    const article = await seedArticle(store, source, 'bodrum-sicak', {
      description: snippet,
      articleBodyText: snippet,
      charCount: snippet.length,
      wordCount: 20,
    })
    const input = buildNewsroomInputFromRaw(article, source)
    expect(input.originalContent.length).toBeLessThan(500)

    const enriched = await enrichThinBodyForEditorAi({ store, article, input })
    expect(enriched.originalContent.length).toBeGreaterThan(500)
    expect(enriched.originalContent).toContain('Ek paragraf')

    const saved = await store.getRawArticle(article.id)
    expect(saved?.articleBodyText).toContain('Ek paragraf')
    expect(saved?.rssSnippetUsedAsBody).toBe(false)
  })

  it('surfaces actionable Turkish skip for quality:body_too_short', async () => {
    const store = new MemoryCrawlerStore()
    const source = await seedSource(store)
    const article = await seedArticle(store, source, 'kisa-govde')
    const processArticle = async () => ({
      outcome: 'skipped' as const,
      skipReason: 'quality:body_too_short',
    })

    const result = await publishRawArticlesWithAi({
      store,
      ids: [article.id],
      processArticle: processArticle as never,
    })

    expect(result.results[0]?.error).toContain('İçerik çok kısa')
    expect(result.results[0]?.error).toContain('kaynağı kontrol edin')
  })

  it('always attempts source enrich for editor path (PARTIAL Habertürk)', async () => {
    const { fetchArticleEnrichment } = await import('@/services/rss/articleFetcher')
    vi.mocked(fetchArticleEnrichment).mockResolvedValueOnce({
      imageUrl: null,
      description: null,
      bodyText: RICH_BODY,
      htmlBody: `<p>${RICH_BODY}</p>`,
      author: null,
      publishedAt: null,
      readingTimeMinutes: 2,
      extractionMethod: 'test',
    })

    const store = new MemoryCrawlerStore()
    const source = await seedSource(store, 'Haberturk')
    // Already "long enough" but PARTIAL — must still re-fetch
    const article = await seedArticle(store, source, 'kismi-ht', {
      qualityStatus: 'PARTIAL',
      articleBodyText: RICH_BODY.slice(0, 600),
      description: RICH_BODY.slice(0, 200),
    })
    const input = buildNewsroomInputFromRaw(article, source)
    const enriched = await enrichThinBodyForEditorAi({ store, article, input })
    expect(fetchArticleEnrichment).toHaveBeenCalled()
    expect(enriched.originalContent.length).toBeGreaterThanOrEqual(input.originalContent.length)
  })
})
