import type { CrawlerEditorialStatus, RawArticleRecord } from '../types'
import { isWatchingQueueCluster } from './controlPlane'
import type {
  RawArticleInboxSummary,
  RawArticleListQuery,
  RawArticleListResult,
  RawArticleListRow,
  RawArticleQueueCounts,
  RawArticleSourceFacet,
} from '../store/types'

export const RAW_ARTICLE_PAGE_SIZES = [25, 50, 100] as const

export const ACTIVE_EDITORIAL_STATUSES: CrawlerEditorialStatus[] = [
  'NEW',
  'IN_REVIEW',
  'AI_CANDIDATE',
  'DRAFT',
  'EDITING',
  'SKIPPED',
]

export type RawArticleQueueTab = 'active' | 'published' | 'rejected' | 'archived' | 'all'

export type RawArticleSortColumn =
  | 'fetchedAt'
  | 'publishedAt'
  | 'wordCount'
  | 'extractionConfidence'
  | 'source'
  | 'status'
  | 'editorial'

export type SortOrder = 'asc' | 'desc'

export function parseQueueTab(value: string | null): RawArticleQueueTab {
  if (value === 'published' || value === 'rejected' || value === 'archived' || value === 'all') return value
  return 'active'
}

export function parseSortColumn(value: string | null): RawArticleSortColumn | null {
  if (
    value === 'fetchedAt' ||
    value === 'publishedAt' ||
    value === 'wordCount' ||
    value === 'extractionConfidence' ||
    value === 'source' ||
    value === 'status' ||
    value === 'editorial'
  ) {
    return value
  }
  return null
}

export function parseSortOrder(value: string | null): SortOrder {
  return value === 'asc' ? 'asc' : 'desc'
}

export function queueCountsFromStatuses(counts: Record<string, number>): RawArticleQueueCounts {
  const active = ACTIVE_EDITORIAL_STATUSES.reduce((sum, key) => sum + (counts[key] || 0), 0)
  return {
    active,
    published: counts.PUBLISHED || 0,
    rejected: counts.REJECTED || 0,
    archived: counts.ARCHIVED || 0,
  }
}

export function nextSortState(
  currentColumn: string | null,
  currentOrder: string | null,
  clicked: RawArticleSortColumn
): { sort: string | null; order: string | null } {
  if (currentColumn !== clicked) return { sort: clicked, order: 'desc' }
  if ((currentOrder || 'desc') === 'desc') return { sort: clicked, order: 'asc' }
  return { sort: null, order: null }
}

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
  if (!query.editorialStatus) {
    const queue = query.queue || 'active'
    if (queue === 'published' && article.editorialStatus !== 'PUBLISHED') return false
    else if (queue === 'rejected' && article.editorialStatus !== 'REJECTED') return false
    else if (queue === 'archived' && article.editorialStatus !== 'ARCHIVED') return false
    else if (queue === 'all' && article.editorialStatus === 'DELETED') return false
    else if (queue === 'active' && !ACTIVE_EDITORIAL_STATUSES.includes(article.editorialStatus)) return false
  }
  if (article.editorialStatus === 'DELETED' && query.queue !== 'all') return false
  if (query.hasImage === true && !articleHasImage(article)) return false
  if (query.hasImage === false && articleHasImage(article)) return false
  if (query.status === 'duplicate' && !article.isExactDuplicate) return false
  if (query.status === 'extracted' && (article.isExactDuplicate || article.qualityStatus === 'FAILED')) return false
  if (query.status === 'failed' && article.qualityStatus !== 'FAILED') return false
  if (shouldHideSupportingFromPrimaryQueue(article, query)) return false
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

/** Phase 4E — supporting evidence stays in cluster detail, not primary Ham Haber clutter. */
export function shouldHideSupportingFromPrimaryQueue(
  article: RawArticleRecord,
  query: Pick<RawArticleListQuery, 'eventPrimaryOnly' | 'queue' | 'status'>
): boolean {
  const primaryOnly =
    query.eventPrimaryOnly !== false &&
    (query.queue || 'active') === 'active' &&
    query.status !== 'duplicate'
  if (!primaryOnly) return false
  if (!article.clusterId) return false
  const role = article.clusterRole
  if (role === 'SUPPORTING' || role === 'DUPLICATE' || role === 'LOW_QUALITY') return true
  if (article.isExactDuplicate && role !== 'PRIMARY' && role !== 'MATERIAL_UPDATE') return true
  return false
}

function timestamp(value: Date | null | undefined): number {
  return value?.getTime() || 0
}

function statusRank(article: { isExactDuplicate: boolean; qualityStatus: string }): number {
  if (article.isExactDuplicate) return 2
  if (article.qualityStatus === 'FAILED') return 3
  if (article.qualityStatus === 'LOW_CONFIDENCE') return 1
  return 0
}

export function sortRawArticleRows<T extends RawArticleListRow>(rows: T[], query: RawArticleListQuery): T[] {
  const copy = [...rows]
  const column = query.sortBy
  const dir = query.order === 'asc' ? 1 : -1
  if (!column) {
    return sortRawArticles(copy, query.sort) as T[]
  }
  copy.sort((a, b) => {
    let cmp = 0
    if (column === 'wordCount') cmp = (a.wordCount || 0) - (b.wordCount || 0)
    else if (column === 'extractionConfidence') cmp = (a.extractionConfidence || 0) - (b.extractionConfidence || 0)
    else if (column === 'source') cmp = a.sourceName.localeCompare(b.sourceName, 'tr')
    else if (column === 'editorial') cmp = a.editorialStatus.localeCompare(b.editorialStatus)
    else if (column === 'status') cmp = statusRank(a) - statusRank(b)
    else if (column === 'publishedAt') cmp = timestamp(a.publishedAt || a.fetchedAt) - timestamp(b.publishedAt || b.fetchedAt)
    else cmp = timestamp(a.fetchedAt) - timestamp(b.fetchedAt)
    if (cmp === 0) cmp = timestamp(a.fetchedAt) - timestamp(b.fetchedAt)
    return cmp * dir
  })
  return copy
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

export interface ClusterListQuery {
  page?: number
  pageSize?: number
  country?: string | null
  city?: string | null
  district?: string | null
  sourceId?: string | null
  eligibility?: string | null
  editorialDecision?: string | null
  editorialPriority?: string | null
  minSources?: number | null
  minArticles?: number | null
  minImportance?: number | null
  minConfidence?: number | null
  maxAgeHours?: number | null
  dateFrom?: Date | null
  dateTo?: Date | null
  since?: Date | null
  tab?: 'all' | 'watching' | 'eligible' | 'high' | 'approved' | 'rejected' | 'archived' | ''
}

export function matchesClusterQuery(
  cluster: import('../types').NewsClusterRecord,
  query: ClusterListQuery,
  now = new Date()
): boolean {
  if (query.country && (cluster.countryCode || '').toUpperCase() !== query.country.toUpperCase()) return false
  if (query.city && (cluster.city || '').toLocaleLowerCase('tr-TR') !== query.city.toLocaleLowerCase('tr-TR')) {
    return false
  }
  if (query.district && (cluster.district || '').toLocaleLowerCase('tr-TR') !== query.district.toLocaleLowerCase('tr-TR')) {
    return false
  }
  if (query.eligibility && cluster.aiEligibility !== query.eligibility) return false
  if (query.editorialDecision && cluster.editorialDecision !== query.editorialDecision) return false
  if (query.editorialPriority && cluster.editorialPriority !== query.editorialPriority) return false
  if (query.minSources && cluster.uniqueSourceCount < query.minSources) return false
  if (query.minArticles && cluster.articleCount < query.minArticles) return false
  if (query.minImportance != null && cluster.importanceScore < query.minImportance) return false
  if (query.minConfidence != null && cluster.clusterConfidence < query.minConfidence) return false
  if (query.since && cluster.lastSeenAt < query.since) return false
  const ageHours = (now.getTime() - cluster.firstSeenAt.getTime()) / 3600000
  if (query.maxAgeHours != null && ageHours > query.maxAgeHours) return false
  if (query.dateFrom && cluster.firstSeenAt < query.dateFrom) return false
  if (query.dateTo && cluster.firstSeenAt > query.dateTo) return false
  switch (query.tab) {
    case 'watching':
      return isWatchingQueueCluster(cluster)
    case 'eligible':
      return cluster.aiEligibility === 'ELIGIBLE'
    case 'high':
      return cluster.aiEligibility === 'HIGH_PRIORITY'
    case 'approved':
      return cluster.editorialDecision === 'APPROVED_FOR_AI'
    case 'rejected':
      return cluster.editorialDecision === 'REJECTED' || cluster.aiEligibility === 'REJECTED'
    case 'archived':
      return cluster.editorialDecision === 'ARCHIVED'
    default:
      return true
  }
}

export function parseClusterListQuery(url: URL): ClusterListQuery {
  const num = (key: string) => {
    const raw = url.searchParams.get(key)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const date = (key: string) => {
    const raw = url.searchParams.get(key)
    if (!raw) return null
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const tab = (url.searchParams.get('tab') || '') as ClusterListQuery['tab']
  return {
    page: Number(url.searchParams.get('page') || '1') || 1,
    pageSize: clampPageSize(Number(url.searchParams.get('pageSize') || '25')),
    country: url.searchParams.get('country') || null,
    city: url.searchParams.get('city') || null,
    district: url.searchParams.get('district') || null,
    sourceId: url.searchParams.get('sourceId') || url.searchParams.get('source') || null,
    eligibility: url.searchParams.get('eligibility') || null,
    editorialDecision: url.searchParams.get('editorialDecision') || null,
    editorialPriority: url.searchParams.get('editorialPriority') || null,
    minSources: num('minSources'),
    minArticles: num('minArticles'),
    minImportance: num('minImportance'),
    minConfidence: num('minConfidence'),
    maxAgeHours: num('maxAgeHours') ?? num('age'),
    dateFrom: date('dateFrom'),
    dateTo: date('dateTo'),
    tab: tab || '',
  }
}

export interface SourceListQuery {
  page?: number
  pageSize?: number
  search?: string | null
  status?: string | null
  country?: string | null
  scope?: string | null
  tier?: string | null
}

export function matchesSourceQuery(
  source: {
    name: string
    domain: string
    status: string
    countryCode: string
    geographicScope?: string | null
    qualityTier?: string | null
  },
  query: SourceListQuery
): boolean {
  if (query.status && source.status !== query.status) return false
  if (query.country && source.countryCode.toUpperCase() !== query.country.toUpperCase()) return false
  if (query.scope && (source.geographicScope || '') !== query.scope) return false
  if (query.tier && (source.qualityTier || '') !== query.tier) return false
  if (query.search?.trim()) {
    const q = query.search.trim().toLocaleLowerCase('tr-TR')
    const hay = `${source.name} ${source.domain}`.toLocaleLowerCase('tr-TR')
    if (!hay.includes(q)) return false
  }
  return true
}

export function parseSourceListQuery(url: URL): SourceListQuery {
  return {
    page: Number(url.searchParams.get('page') || '1') || 1,
    pageSize: clampPageSize(Number(url.searchParams.get('pageSize') || '25')),
    search: url.searchParams.get('search') || url.searchParams.get('q') || null,
    status: url.searchParams.get('status') || null,
    country: url.searchParams.get('country') || null,
    scope: url.searchParams.get('scope') || null,
    tier: url.searchParams.get('tier') || null,
  }
}

export function paginateSlice<T>(items: T[], page?: number, pageSize?: number) {
  const size = clampPageSize(pageSize)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / size) || 1)
  const p = clampPage(page, totalPages)
  const start = (p - 1) * size
  return { items: items.slice(start, start + size), page: p, pageSize: size, total, totalPages }
}
