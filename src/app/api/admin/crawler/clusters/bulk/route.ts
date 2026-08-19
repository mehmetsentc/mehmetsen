import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { isBulkError, runClusterBulk, type ClusterBulkOp } from '@/services/crawler/editorial/bulk'
import { parseClusterListQuery } from '@/services/crawler/editorial/query'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OPS: ClusterBulkOp[] = ['approve_for_ai', 'watch', 'reject', 'archive', 'restore']

function clusterFilterFromBody(body: Record<string, unknown>) {
  const filter = (body.filter as Record<string, unknown>) || body
  const fake = new URL('https://local.invalid')
  const set = (k: string, v: unknown) => {
    if (v != null && v !== '') fake.searchParams.set(k, String(v))
  }
  set('country', filter.country ?? filter.countryCode)
  set('city', filter.city)
  set('district', filter.district)
  set('sourceId', filter.sourceId ?? filter.source)
  set('eligibility', filter.eligibility)
  set('editorialDecision', filter.editorialDecision)
  set('editorialPriority', filter.editorialPriority)
  set('minSources', filter.minSources)
  set('minArticles', filter.minArticles)
  set('minImportance', filter.minImportance)
  set('minConfidence', filter.minConfidence)
  set('maxAgeHours', filter.maxAgeHours ?? filter.age)
  set('dateFrom', filter.dateFrom)
  set('dateTo', filter.dateTo)
  set('tab', filter.tab)
  return parseClusterListQuery(fake)
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const op = body.op as ClusterBulkOp
  if (!OPS.includes(op)) return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 })

  const store = new DrizzleCrawlerStore()
  const result = await runClusterBulk({
    store,
    actor: { uid: auth.uid, role: auth.role, email: auth.email },
    op,
    ids: Array.isArray(body.ids) ? body.ids.map(String) : [],
    matchFilter: body.matchFilter === true,
    filter: clusterFilterFromBody(body),
    reason: typeof body.reason === 'string' ? body.reason : null,
    note: typeof body.note === 'string' ? body.note : null,
    editorialPriority: typeof body.editorialPriority === 'string' ? body.editorialPriority : null,
    approvalSource: typeof body.approvalSource === 'string' ? body.approvalSource : null,
    selectionMode: typeof body.selectionMode === 'string' ? (body.selectionMode as never) : undefined,
    confirmStale: body.confirmStale === true,
  })
  if (isBulkError(result)) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
