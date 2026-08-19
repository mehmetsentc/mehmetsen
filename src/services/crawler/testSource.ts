import { discoverSource } from './discovery/run'
import { extractArticleWithFallback } from './extract/pipeline'
import { fetchDocument, type FetchImpl } from './http/fetchDocument'
import { dispatchCrawlerArticleToNewsroom } from './dispatch'
import { hostnameOf, normalizeArticleUrl } from './url/normalize'
import type { HostLookup } from './url/ssrf'
import type { CrawlerStore } from './store/types'
import type { InsertSourceInput } from './store/types'

export async function testCrawlerSource(opts: {
  store: CrawlerStore
  input: InsertSourceInput
  fetchImpl?: FetchImpl
  lookup?: HostLookup
}) {
  const source = await opts.store.insertSource({ ...opts.input, status: 'PAUSED' })
  const discovery = await discoverSource({
    source,
    store: opts.store,
    fetchImpl: opts.fetchImpl,
    lookup: opts.lookup,
  })
  const pending = await opts.store.listPendingFetch(1)
  if (!pending[0]) {
    return {
      sourceId: source.id,
      discovery,
      fetch: null,
      extraction: null,
      dispatch: dispatchCrawlerArticleToNewsroom({ sourceId: source.id }),
    }
  }
  const item = pending[0]
  const fetched = await fetchDocument({
    url: item.normalizedUrl,
    fetchImpl: opts.fetchImpl,
    lookup: opts.lookup,
    sourceId: source.id,
  })
  const extracted = fetched.ok
    ? await extractArticleWithFallback(fetched.body, fetched.finalUrl, source.language)
    : null
  return {
    sourceId: source.id,
    discovery,
    fetch: {
      urlHost: hostnameOf(item.normalizedUrl),
      status: fetched.status,
      ok: fetched.ok,
      errorCode: fetched.errorCode,
    },
    extraction: extracted
      ? {
          method: extracted.extractionMethod,
          titleFound: Boolean(extracted.title),
          wordCount: extracted.wordCount,
          paragraphCount: extracted.paragraphCount,
          imageFound: Boolean(extracted.mainImageUrl),
          publishedAtFound: Boolean(extracted.publishedAt),
          confidence: extracted.extractionConfidence,
          canonical: Boolean(extracted.canonicalUrl || normalizeArticleUrl(fetched.finalUrl)),
        }
      : null,
    dispatch: dispatchCrawlerArticleToNewsroom({ sourceId: source.id }),
  }
}
