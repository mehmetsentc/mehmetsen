import type { CrawlerStore } from './types'
import type { NewsSourceRecord, RawArticleRecord } from '../types'

/**
 * FinOps 2 Oct: cluster/AI-dispatch/auto-draft loops loaded every member article
 * and source one row at a time — ~190k single-row Postgres reads/day (pg_stat_statements),
 * ~4.5k per crawler tick. Load them in one round-trip per 200 ids when the store
 * supports it; otherwise fall back to the old per-id reads.
 */
export async function loadArticlesTextByIds(
  store: CrawlerStore,
  ids: string[]
): Promise<Map<string, RawArticleRecord>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (store.getRawArticlesTextByIds) return store.getRawArticlesTextByIds(unique)
  const out = new Map<string, RawArticleRecord>()
  for (const id of unique) {
    const article = await (store.getRawArticleText ? store.getRawArticleText(id) : store.getRawArticle(id))
    if (article) out.set(id, article)
  }
  return out
}

export async function loadSourcesByIds(
  store: CrawlerStore,
  ids: string[]
): Promise<Map<string, NewsSourceRecord>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (store.getSourcesByIds) return store.getSourcesByIds(unique)
  const out = new Map<string, NewsSourceRecord>()
  for (const id of unique) {
    const source = await store.getSource(id)
    if (source) out.set(id, source)
  }
  return out
}
