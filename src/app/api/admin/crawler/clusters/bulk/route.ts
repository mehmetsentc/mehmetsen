import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { isBulkError, runClusterBulk, type ClusterBulkOp } from '@/services/crawler/editorial/bulk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OPS: ClusterBulkOp[] = ['approve_for_ai', 'watch', 'reject', 'archive']

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const op = body.op as ClusterBulkOp
  if (!OPS.includes(op)) return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 })

  const filter = (body.filter as Record<string, unknown>) || body
  const store = new DrizzleCrawlerStore()
  const result = await runClusterBulk({
    store,
    actor: { uid: auth.uid, role: auth.role, email: auth.email },
    op,
    ids: Array.isArray(body.ids) ? body.ids.map(String) : [],
    matchFilter: body.matchFilter === true,
    filter: {
      eligibility: typeof filter.eligibility === 'string' ? filter.eligibility : null,
      editorialDecision: typeof filter.editorialDecision === 'string' ? filter.editorialDecision : null,
      country: typeof filter.country === 'string' ? filter.country : null,
      city: typeof filter.city === 'string' ? filter.city : null,
    },
    reason: typeof body.reason === 'string' ? body.reason : null,
    note: typeof body.note === 'string' ? body.note : null,
  })
  if (isBulkError(result)) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
