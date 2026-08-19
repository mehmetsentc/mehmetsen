import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { clampPageSize, parseEditorialStatus, parseHasImage } from '@/services/crawler/editorial/query'
import { isBulkError, runArticleBulk, type ArticleBulkOp } from '@/services/crawler/editorial/bulk'
import type { CrawlerQualityStatus } from '@/services/crawler/types'
import type { RawArticleListQuery, RawArticleSort } from '@/services/crawler/store/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OPS: ArticleBulkOp[] = ['review', 'ai_candidate', 'reject', 'archive', 'delete']

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function filterFrom(body: Record<string, unknown>): RawArticleListQuery {
  const quality = body.qualityStatus as CrawlerQualityStatus | null
  const sort = body.sort as RawArticleSort | null
  return {
    page: 1,
    pageSize: clampPageSize(Number(body.pageSize || '25')),
    sort: sort === 'oldest' || sort === 'published' ? sort : 'newest',
    sourceId: typeof body.source === 'string' ? body.source : typeof body.sourceId === 'string' ? body.sourceId : null,
    country: typeof body.country === 'string' ? body.country : null,
    city: typeof body.city === 'string' ? body.city : null,
    status: typeof body.status === 'string' ? body.status : null,
    qualityStatus: quality === 'EXTRACTED' || quality === 'LOW_CONFIDENCE' || quality === 'FAILED' ? quality : null,
    dateFrom: parseDate(body.dateFrom),
    dateTo: parseDate(body.dateTo),
    search: typeof body.search === 'string' ? body.search : null,
    hasImage: parseHasImage(typeof body.hasImage === 'string' ? body.hasImage : null),
    editorialStatus: parseEditorialStatus(typeof body.editorialStatus === 'string' ? body.editorialStatus : null),
  }
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const op = body.op as ArticleBulkOp
  if (!OPS.includes(op)) return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 })

  const store = new DrizzleCrawlerStore()
  const result = await runArticleBulk({
    store,
    actor: { uid: auth.uid, role: auth.role, email: auth.email },
    op,
    ids: Array.isArray(body.ids) ? body.ids.map(String) : [],
    matchFilter: body.matchFilter === true,
    filter: filterFrom((body.filter as Record<string, unknown>) || body),
    reason: typeof body.reason === 'string' ? body.reason : null,
    note: typeof body.note === 'string' ? body.note : null,
  })
  if (isBulkError(result)) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
