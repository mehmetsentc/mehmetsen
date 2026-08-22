import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { clampPageSize, parseEditorialStatus, parseHasImage, parseQueueTab, parseSortColumn, parseSortOrder } from '@/services/crawler/editorial/query'
import {
  AI_PUBLISH_BATCH_CAP,
  authorizeEditorAiPublish,
  publishRawArticlesWithAi,
} from '@/services/crawler/editorial/aiPublish'
import { BULK_ID_CAP, FILTER_MATCH_CAP } from '@/services/crawler/editorial/bulk'
import type { CrawlerQualityStatus } from '@/services/crawler/types'
import type { RawArticleListQuery, RawArticleSort } from '@/services/crawler/store/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function filterFrom(body: Record<string, unknown>): RawArticleListQuery {
  const quality = body.qualityStatus as CrawlerQualityStatus | null
  const sort = body.sort as RawArticleSort | null
  const sortBy = parseSortColumn(typeof body.sort === 'string' ? body.sort : null)
  return {
    page: 1,
    pageSize: clampPageSize(Number(body.pageSize || '25')),
    sort: sortBy ? 'newest' : sort === 'oldest' || sort === 'published' ? sort : 'newest',
    sortBy,
    order: parseSortOrder(typeof body.order === 'string' ? body.order : null),
    queue: parseQueueTab(typeof body.queue === 'string' ? body.queue : null),
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

/**
 * Editor-initiated bulk AI publish from Ham Haberler.
 * Uses newsroom pipeline directly — NOT Ön-AI queue, NOT crawler auto-dispatch.
 */
export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:publish')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authz = authorizeEditorAiPublish(auth.role)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: 403 })

  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const store = new DrizzleCrawlerStore()

  let ids: string[] = []
  let requested = 0
  if (body.matchFilter === true) {
    const listed = await store.listRawArticleIds(filterFrom((body.filter as Record<string, unknown>) || body), FILTER_MATCH_CAP)
    if (listed.total > BULK_ID_CAP) {
      return NextResponse.json({ error: `En fazla ${BULK_ID_CAP} kayıt seçilebilir` }, { status: 400 })
    }
    ids = listed.ids
    requested = listed.total
  } else {
    ids = [...new Set((Array.isArray(body.ids) ? body.ids.map(String) : []).map((id) => id.trim()).filter(Boolean))]
    requested = ids.length
    if (ids.length > BULK_ID_CAP) {
      return NextResponse.json({ error: `En fazla ${BULK_ID_CAP} kayıt seçilebilir` }, { status: 400 })
    }
  }

  if (ids.length > AI_PUBLISH_BATCH_CAP) {
    return NextResponse.json(
      { error: `Tek seferde en fazla ${AI_PUBLISH_BATCH_CAP} haber AI ile yayınlanabilir` },
      { status: 400 }
    )
  }

  const result = await publishRawArticlesWithAi({ store, ids })
  return NextResponse.json({ ...result, requested })
}
