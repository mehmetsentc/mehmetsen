import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import {
  clampPageSize,
  parseEditorialStatus,
  parseHasImage,
  parseQueueTab,
  parseSortColumn,
  parseSortOrder,
} from '@/services/crawler/editorial/query'
import { rawArticleDisplay } from '@/services/crawler/editorial/prefill'
import { summarizeArticleMedia } from '@/services/crawler/editorial/mediaSummary'
import {
  countCrawlerReviewQueue,
  enrichArticlesWithReviewMeta,
  filterReviewQueueArticles,
} from '@/services/crawler/editorial/reviewMeta'
import { queueCountsFromStatuses } from '@/services/crawler/editorial/query'
import type { CrawlerQualityStatus, RawArticleRecord } from '@/services/crawler/types'
import type { RawArticleListQuery, RawArticleSort } from '@/services/crawler/store/types'
import { databaseUnavailableResponse } from '@/lib/adminApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function listQueryFromUrl(url: URL): RawArticleListQuery {
  const pageSize = clampPageSize(Number(url.searchParams.get('pageSize') || '25'))
  const sort = url.searchParams.get('sort') as RawArticleSort | null
  const quality = url.searchParams.get('qualityStatus') as CrawlerQualityStatus | null
  const sortBy = parseSortColumn(url.searchParams.get('sort'))
  const legacySort = sort === 'oldest' || sort === 'published' ? sort : 'newest'
  return {
    page: Number(url.searchParams.get('page') || '1') || 1,
    pageSize,
    sort: sortBy ? 'newest' : legacySort,
    sortBy,
    order: parseSortOrder(url.searchParams.get('order')),
    queue: parseQueueTab(url.searchParams.get('queue')),
    sourceId: url.searchParams.get('source') || url.searchParams.get('sourceId'),
    country: url.searchParams.get('country'),
    city: url.searchParams.get('city'),
    status: url.searchParams.get('status'),
    qualityStatus:
      quality === 'EXTRACTED' ||
      quality === 'GOOD' ||
      quality === 'LOW_CONFIDENCE' ||
      quality === 'FAILED' ||
      quality === 'TOO_SHORT' ||
      quality === 'PARTIAL' ||
      quality === 'EXTRACTION_FAILED' ||
      quality === 'STALE'
        ? quality
        : null,
    dateFrom: parseDate(url.searchParams.get('dateFrom')),
    dateTo: parseDate(url.searchParams.get('dateTo')),
    search: url.searchParams.get('search'),
    hasImage: parseHasImage(url.searchParams.get('hasImage')),
    editorialStatus: parseEditorialStatus(url.searchParams.get('editorialStatus')),
    view: url.searchParams.get('view') === 'bySource' ? 'bySource' : 'all',
    // Default: show ALL articles (including supporting). Only hide supporting if explicitly requested.
    eventPrimaryOnly:
      url.searchParams.get('includeSupporting') === '0' || url.searchParams.get('includeSupporting') === 'false'
        ? true
        : false,
  }
}

function serializeArticle(article: RawArticleRecord & { sourceName?: string }) {
  const display = rawArticleDisplay(article)
  return {
    ...article,
    title: display.title,
    description: display.description,
    articleBodyText: display.articleBodyText,
    sourceName: article.sourceName || article.sourceId,
  }
}

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ articles: null, total: null }), { status: 503 })
  }
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const store = new DrizzleCrawlerStore()
  if (id) {
    const article = await store.getRawArticle(id)
    if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const source = await store.getSource(article.sourceId)
    const media = await store.listArticleMedia(article.id)
    return NextResponse.json({
      article: {
        ...serializeArticle({ ...article, sourceName: source?.name || article.sourceId }),
        source,
      },
      media,
      mediaSummary: summarizeArticleMedia(media),
    })
  }
  const listQuery = listQueryFromUrl(url)
  const result = await store.listRawArticlesPage(listQuery)
  const reviewCount = await countCrawlerReviewQueue().catch(() => 0)
  const queueCounts = {
    ...(result.queueCounts || queueCountsFromStatuses(await store.countEditorialStatuses(), reviewCount)),
    review: reviewCount,
  }

  let articles = result.articles
  let total = result.total
  let page = result.page
  let totalPages = result.totalPages

  if (listQuery.queue === 'review') {
    const enriched = await enrichArticlesWithReviewMeta(articles)
    const filtered = filterReviewQueueArticles(enriched)
    total = filtered.length
    totalPages = Math.max(1, Math.ceil(total / (result.pageSize || 25)) || 1)
    page = Math.min(page, totalPages)
    const start = (page - 1) * (result.pageSize || 25)
    articles = filtered.slice(start, start + (result.pageSize || 25))
  } else {
    articles = await enrichArticlesWithReviewMeta(articles)
  }
  const clusterIds = [...new Set(articles.map((a) => a.clusterId).filter((id): id is string => Boolean(id)))]
  const clusterById = new Map<string, { articleCount: number; uniqueSourceCount: number }>()
  for (const id of clusterIds) {
    const cluster = await store.getCluster(id)
    if (cluster) clusterById.set(id, { articleCount: cluster.articleCount, uniqueSourceCount: cluster.uniqueSourceCount })
  }
  function withEvent(article: RawArticleRecord & { sourceName?: string }) {
    const event = article.clusterId ? clusterById.get(article.clusterId) : null
    return {
      ...serializeArticle(article),
      clusterArticleCount: event?.articleCount ?? null,
      clusterUniqueSourceCount: event?.uniqueSourceCount ?? null,
    }
  }
  return NextResponse.json({
    ...result,
    articles: articles.map(withEvent),
    total,
    page,
    totalPages,
    queueCounts,
    groups: result.groups?.map((g) => ({
      ...g,
      articles: g.articles.map(withEvent),
    })),
  })
}

export async function PATCH(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json(databaseUnavailableResponse(), { status: 503 })
  const body = (await request.json().catch(() => ({}))) as {
    id?: string
    editorialStatus?: string
  }
  if (!body.id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  if (body.editorialStatus !== 'SKIPPED' && body.editorialStatus !== 'NEW') {
    return NextResponse.json({ error: 'Geçersiz editoryal durum' }, { status: 400 })
  }
  const store = new DrizzleCrawlerStore()
  const article = await store.getRawArticle(body.id)
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (article.editorialStatus === 'PUBLISHED') {
    return NextResponse.json({ error: 'Yayındaki haber atlanamaz' }, { status: 409 })
  }
  await store.updateRawArticle(body.id, { editorialStatus: body.editorialStatus })
  return NextResponse.json({ ok: true })
}
