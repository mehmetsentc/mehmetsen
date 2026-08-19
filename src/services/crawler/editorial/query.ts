import type { CrawlerEditorialStatus, RawArticleRecord } from '../types'
import type {
  RawArticleInboxSummary,
  RawArticleListQuery,
  RawArticleListResult,
  RawArticleListRow,
  RawArticleSourceFacet,
} from '../store/types'

export const RAW_ARTICLE_PAGE_SIZES = [25, 50, 100] as const

export function clampPageSize(raw: number | undefined): number {
  if (raw === 50 || raw === 100) return raw
  return 25
}

export function clampPage(page: number | undefined, totalPages: number): number {
  const p = Number.isFinite(page) && (page || 0) > 0 ? Math.floor(page as number) : 1
  return Math.min(Math.max(p, 1), Math.max(totalPages, 1))
}

export function parseHasImage(value: string | null): boolean | null {
  if (value === '1' || value === 'true' || value === 'with') return true
  if (value === '0' || value === 'false' || value === 'without') return false
  return null
}

const EDITORIAL_STATUSES: CrawlerEditorialStatus[] = [
  'NEW',
  'IN_REVIEW',
  'AI_CANDIDATE',
  'REJECTED',
  'ARCHIVED',
  'DELETED',
  'DRAFT',
  'EDITING',
  'PUBLISHED',
  'SKIPPED',
]

export function parseEditorialStatus(value: string | null): CrawlerEditorialStatus | null {
  if (value && EDITORIAL_STATUSES.includes(value as CrawlerEditorialStatus)) {
    return value as CrawlerEditorialStatus
  }
  return null
}

export function articleHasImage(article: RawArticleRecord): boolean {
  return Boolean(article.mainImageUrl && article.mainImageUrl.trim()) || article.imageUrls.length > 0
}

export function matchesRawArticleQuery(article: RawArticleRecord, query: RawArticleListQuery): boolean {
  if (query.sourceId && article.sourceId !== query.sourceId) return false
  if (query.country && (article.countryCode || '').toUpperCase() !== query.country.toUpperCase()) return false
  if (query.city && (article.city || '').toLocaleLowerCase('tr-TR') !== query.city.toLocaleLowerCase('tr-TR')) {
    return false
  }
  if (query.qualityStatus && article.qualityStatus !== query.qualityStatus) return false
  if (query.editorialStatus && article.editorialStatus !== query.editorialStatus) return false
  if (!query.editorialStatus && article.editorialStatus === 'DELETED') return false
  if (query.hasImage === true && !articleHasImage(article)) return false
  if (query.hasImage === false && articleHasImage(article)) return false
  if (query.status === 'duplicate' && !article.isExactDuplicate) return false
  if (query.status === 'extracted' && (article.isExactDuplicate || article.qualityStatus === 'FAILED')) return false
  if (query.status === 'failed' && article.qualityStatus !== 'FAILED') return false
  const when = article.publishedAt || article.fetchedAt
  if (query.dateFrom && when && when < query.dateFrom) return false
  if (query.dateTo && when && when > query.dateTo) return false
  if (query.search?.trim()) {
    const q = query.search.trim().toLocaleLowerCase('tr-TR')
    const title = (article.title || '').toLocaleLowerCase('tr-TR')
    if (!title.includes(q)) return false
  }
  return true
}

export function sortRawArticles(articles: RawArticleRecord[], sort: RawArticleListQuery['sort']): RawArticleRecord[] {
  const copy = [...articles]
  copy.sort((a, b) => {
    if (sort === 'oldest') {
      return (a.fetchedAt?.getTime() || 0) - (b.fetchedAt?.getTime() || 0)
    }
    if (sort === 'published') {
      return (b.publishedAt?.getTime() || b.fetchedAt?.getTime() || 0) - (a.publishedAt?.getTime() || a.fetchedAt?.getTime() || 0)
    }
    return (b.fetchedAt?.getTime() || 0) - (a.fetchedAt?.getTime() || 0)
  })
  return copy
}

export function summarizeArticles(articles: RawArticleRecord[], sourceCount: number, now = new Date()): RawArticleInboxSummary {
  const hourAgo = now.getTime() - 60 * 60 * 1000
  return {
    total: articles.length,
    sourceCount,
    lastHour: articles.filter((a) => (a.fetchedAt?.getTime() || 0) >= hourAgo).length,
    withImage: articles.filter(articleHasImage).length,
    withoutImage: articles.filter((a) => !articleHasImage(a)).length,
    duplicates: articles.filter((a) => a.isExactDuplicate).length,
  }
}

export function buildSourceFacets(
  articles: RawArticleListRow[]
): RawArticleSourceFacet[] {
  const map = new Map<string, RawArticleSourceFacet>()
  for (const article of articles) {
    const row = map.get(article.sourceId) || {
      sourceId: article.sourceId,
      sourceName: article.sourceName,
      countryCode: article.countryCode,
      city: article.city,
      articleCount: 0,
      latestFetchedAt: article.fetchedAt,
      withImage: 0,
      duplicates: 0,
    }
    row.articleCount += 1
    if (articleHasImage(article)) row.withImage += 1
    if (article.isExactDuplicate) row.duplicates += 1
    if (
      article.fetchedAt &&
      (!row.latestFetchedAt || article.fetchedAt > row.latestFetchedAt)
    ) {
      row.latestFetchedAt = article.fetchedAt
    }
    map.set(article.sourceId, row)
  }
  return [...map.values()].sort(
    (a, b) => (b.latestFetchedAt?.getTime() || 0) - (a.latestFetchedAt?.getTime() || 0)
  )
}

export function paginateRawArticles(
  rows: RawArticleListRow[],
  query: RawArticleListQuery,
  now = new Date()
): RawArticleListResult {
  const pageSize = clampPageSize(query.pageSize)
  const sourceFacets = buildSourceFacets(rows)
  const summary = summarizeArticles(rows, sourceFacets.length, now)

  if (query.view === 'bySource') {
    const totalPages = Math.max(1, Math.ceil(sourceFacets.length / pageSize) || 1)
    const page = clampPage(query.page, totalPages)
    const start = (page - 1) * pageSize
    const pageFacets = sourceFacets.slice(start, start + pageSize)
    const groups = pageFacets.map((facet) => ({
      ...facet,
      articles: rows
        .filter((a) => a.sourceId === facet.sourceId)
        .slice(0, 8),
    }))
    return {
      articles: groups.flatMap((g) => g.articles),
      total: rows.length,
      page,
      pageSize,
      totalPages,
      summary,
      sources: sourceFacets,
      groups,
    }
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize) || 1)
  const page = clampPage(query.page, totalPages)
  const start = (page - 1) * pageSize
  return {
    articles: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
    totalPages,
    summary,
    sources: sourceFacets,
  }
}

export function numberedPages(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const set = new Set([1, totalPages, page, page - 1, page + 1, page - 2, page + 2])
  const nums = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b)
  const out: Array<number | 'ellipsis'> = []
  let prev = 0
  for (const n of nums) {
    if (prev && n - prev > 1) out.push('ellipsis')
    out.push(n)
    prev = n
  }
  return out
}
