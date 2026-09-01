/**
 * POST /api/admin/crawler/articles/ai-enqueue
 *
 * Fast endpoint: marks selected raw articles as AI_QUEUED and returns
 * immediately. A cron worker picks them up in the background.
 *
 * Auth: Bearer CMS token with news:publish
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { clampPageSize, parseEditorialStatus, parseHasImage, parseQueueTab, parseSortColumn, parseSortOrder } from '@/services/crawler/editorial/query'
import { BULK_ID_CAP, FILTER_MATCH_CAP } from '@/services/crawler/editorial/bulk'
import { AI_ENQUEUE_BATCH_CAP, enqueueRawArticlesForAi } from '@/services/crawler/editorial/aiEnqueue'
import { authorizeEditorAiPublish } from '@/services/crawler/editorial/aiPublish'
import { isManualEditorAiEnabled } from '@/services/crawler/automatedAiPolicy'
import type { CrawlerQualityStatus } from '@/services/crawler/types'
import type { RawArticleListQuery, RawArticleSort } from '@/services/crawler/store/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function POST(request: Request) {
  try {
    const auth = await verifyCmsToken(request, 'news:publish')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const authz = authorizeEditorAiPublish(auth.role)
    if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: 403 })

    if (!isManualEditorAiEnabled()) {
      return NextResponse.json(
        { error: 'MANUAL_EDITOR_AI_ENABLED=false (Manuel editör AI kapalı)' },
        { status: 403 }
      )
    }

    if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const store = new DrizzleCrawlerStore()

    let ids: string[] = []
    if (body.matchFilter === true) {
      const listed = await store.listRawArticleIds(
        filterFrom((body.filter as Record<string, unknown>) || body),
        FILTER_MATCH_CAP
      )
      if (listed.total > BULK_ID_CAP) {
        return NextResponse.json({ error: `En fazla ${BULK_ID_CAP} kayıt seçilebilir` }, { status: 400 })
      }
      ids = listed.ids
    } else {
      ids = [
        ...new Set(
          (Array.isArray(body.ids) ? body.ids.map(String) : [])
            .map((id) => id.trim())
            .filter(Boolean)
        ),
      ]
      if (ids.length > AI_ENQUEUE_BATCH_CAP) {
        return NextResponse.json({ error: `En fazla ${AI_ENQUEUE_BATCH_CAP} haber kuyruğa eklenebilir` }, { status: 400 })
      }
    }

    const result = await enqueueRawArticlesForAi(store, ids)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[ai-enqueue]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Kuyruğa ekleme başarısız' }, { status: 500 })
  }
}
