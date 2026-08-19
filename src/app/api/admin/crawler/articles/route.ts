import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import {
  clampPageSize,
  parseEditorialStatus,
  parseHasImage,
} from '@/services/crawler/editorial/query'
import { rawArticleDisplay } from '@/services/crawler/editorial/prefill'
import { summarizeArticleMedia } from '@/services/crawler/editorial/mediaSummary'
import type { CrawlerQualityStatus, RawArticleRecord } from '@/services/crawler/types'
import type { RawArticleListQuery, RawArticleSort } from '@/services/crawler/store/types'

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
  return {
    page: Number(url.searchParams.get('page') || '1') || 1,
    pageSize,
    sort: sort === 'oldest' || sort === 'published' ? sort : 'newest',
    sourceId: url.searchParams.get('source') || url.searchParams.get('sourceId'),
    country: url.searchParams.get('country'),
    city: url.searchParams.get('city'),
    status: url.searchParams.get('status'),
    qualityStatus: quality === 'EXTRACTED' || quality === 'LOW_CONFIDENCE' || quality === 'FAILED' ? quality : null,
    dateFrom: parseDate(url.searchParams.get('dateFrom')),
    dateTo: parseDate(url.searchParams.get('dateTo')),
    search: url.searchParams.get('search'),
    hasImage: parseHasImage(url.searchParams.get('hasImage')),
    editorialStatus: parseEditorialStatus(url.searchParams.get('editorialStatus')),
    view: url.searchParams.get('view') === 'bySource' ? 'bySource' : 'all',
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
    return NextResponse.json({ error: 'DATABASE_URL missing', articles: [] }, { status: 503 })
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
  const result = await store.listRawArticlesPage(listQueryFromUrl(url))
  return NextResponse.json({
    ...result,
    articles: result.articles.map(serializeArticle),
    groups: result.groups?.map((g) => ({
      ...g,
      articles: g.articles.map(serializeArticle),
    })),
  })
}

export async function PATCH(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
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
