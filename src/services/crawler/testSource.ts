import { discoverSource } from './discovery/run'
import { extractArticleWithFallback } from './extract/pipeline'
import { fetchDocument, type FetchImpl } from './http/fetchDocument'
import { dispatchCrawlerArticleToNewsroom } from './dispatch'
import { hostnameOf, normalizeArticleUrl } from './url/normalize'
import type { HostLookup } from './url/ssrf'
import { MemoryCrawlerStore } from './store/memory'
import type { CrawlerStore } from './store/types'
import type { InsertSourceInput } from './store/types'
import { classifySourceTest } from './classify'
import { crawlIntervalForPriority } from './enabled'
import { boilerplateRatio } from './extract/confidence'

export async function testCrawlerSource(opts: {
  store?: CrawlerStore
  persist?: boolean
  input: InsertSourceInput
  fetchImpl?: FetchImpl
  lookup?: HostLookup
  maxFetch?: number
}) {
  void opts.store
  const persist = opts.persist === true
  const ephemeral = persist && opts.store ? opts.store : new MemoryCrawlerStore()
  const source = await ephemeral.insertSource({ ...opts.input, status: 'PAUSED' })
  const discovery = await discoverSource({
    source,
    store: ephemeral,
    fetchImpl: opts.fetchImpl,
    lookup: opts.lookup,
  })
  const pending = await ephemeral.listPendingFetch(opts.maxFetch ?? 3)
  const samples = []
  for (const item of pending) {
    const fetched = await fetchDocument({
      url: item.normalizedUrl,
      fetchImpl: opts.fetchImpl,
      lookup: opts.lookup,
      sourceId: source.id,
    })
    const extracted = fetched.ok
      ? await extractArticleWithFallback(fetched.body, fetched.finalUrl, source.language)
      : null
    samples.push({
      urlHost: hostnameOf(item.normalizedUrl),
      status: fetched.status,
      ok: fetched.ok,
      errorCode: fetched.errorCode,
      extraction: extracted
        ? {
            method: extracted.extractionMethod,
            titleFound: Boolean(extracted.title),
            wordCount: extracted.wordCount,
            paragraphCount: extracted.paragraphCount,
            charCount: extracted.charCount,
            imageFound: Boolean(extracted.mainImageUrl),
            publishedAtFound: Boolean(extracted.publishedAt),
            confidence: extracted.extractionConfidence,
            canonical: Boolean(extracted.canonicalUrl || normalizeArticleUrl(fetched.finalUrl)),
            boilerplateRatio: boilerplateRatio(extracted.articleBodyText, extracted.title || ''),
          }
        : null,
    })
  }

  const fetchedOk = samples.filter((s) => s.ok).length
  const extractedOk = samples.filter((s) => s.extraction && s.extraction.wordCount >= 80 && s.extraction.titleFound).length
  const avgWords =
    extractedOk > 0
      ? Math.round(
          samples.reduce((n, s) => n + (s.extraction?.wordCount || 0), 0) / Math.max(extractedOk, 1)
        )
      : 0
  const avgConfidence =
    extractedOk > 0
      ? samples.reduce((n, s) => n + (s.extraction?.confidence || 0), 0) / Math.max(extractedOk, 1)
      : 0
  const classified = classifySourceTest({
    discovered: discovery.discovered,
    fetchedOk,
    extractedOk,
    avgWords,
    avgConfidence,
    imageRate: extractedOk ? samples.filter((s) => s.extraction?.imageFound).length / extractedOk : 0,
    dateRate: extractedOk ? samples.filter((s) => s.extraction?.publishedAtFound).length / extractedOk : 0,
    blocked: samples.some((s) => s.status === 403 || s.status === 401 || s.status === 451),
    jsLikely: extractedOk === 0 && fetchedOk > 0,
  })

  const first = samples[0]
  return {
    persisted: persist,
    sourceId: persist ? source.id : null,
    outcome: classified.outcome,
    tier: classified.tier,
    discovery,
    fetch: first
      ? { urlHost: first.urlHost, status: first.status, ok: first.ok, errorCode: first.errorCode }
      : null,
    extraction: first?.extraction || null,
    samples: samples.map((s) => ({
      httpStatus: s.status,
      wordCount: s.extraction?.wordCount ?? 0,
      image: Boolean(s.extraction?.imageFound),
      date: Boolean(s.extraction?.publishedAtFound),
      confidence: s.extraction?.confidence ?? 0,
    })),
    proposed: {
      discoveryType: source.discoveryMethod,
      rssUrls: source.rssUrls,
      sitemapUrls: source.sitemapUrls,
      fetchMode: source.articleFetchMode,
      requiresJavascript: classified.tier === 'TIER_C',
      crawlInterval: source.crawlIntervalSeconds || crawlIntervalForPriority('NORMAL'),
      language: source.language,
      country: source.countryCode,
      extractionStrategy: 'generic-http',
      qualityTier: classified.tier,
    },
    dispatch: dispatchCrawlerArticleToNewsroom({ sourceId: source.id }),
    aiCalls: 0,
  }
}
