import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { hasDatabaseUrl } from '@/db'
import { bootstrapPublishersFromNewsSources } from '@/services/publisher/publisherBootstrapService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const dryRun = body.dryRun !== false
  const limit = typeof body.limit === 'number' ? body.limit : Number(body.limit ?? 25)
  const sourceIds = Array.isArray(body.sourceIds)
    ? body.sourceIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : undefined

  try {
    const result = await bootstrapPublishersFromNewsSources({ dryRun, limit, sourceIds })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/publishers/bootstrap]', err)
    return NextResponse.json({ error: 'Bootstrap failed' }, { status: 500 })
  }
}
