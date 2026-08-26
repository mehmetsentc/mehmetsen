import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { requireStudioAuth, studioDisabledResponse, studioErrorResponse } from '@/lib/publisher/studioApi'
import { publisherLayoutService } from '@/services/publisher/publisherLayoutService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  const { publisherId } = await context.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof body.targetLayoutId !== 'string') {
    return NextResponse.json({ error: 'targetLayoutId required' }, { status: 400 })
  }
  try {
    const { user } = await requireStudioAuth(request, publisherId, 'layout:edit')
    const layout = await publisherLayoutService.rollback(publisherId, user.uid, body.targetLayoutId)
    return NextResponse.json(layout)
  } catch (err) {
    if (err instanceof Error && err.message === 'DISABLED') return studioDisabledResponse()
    return studioErrorResponse(err)
  }
}

export async function GET(request: Request, context: RouteContext) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  const { publisherId } = await context.params
  try {
    const { user } = await requireStudioAuth(request, publisherId, 'layout:read')
    const versions = await publisherLayoutService.listVersionHistory(publisherId, user.uid)
    return NextResponse.json({ versions })
  } catch (err) {
    if (err instanceof Error && err.message === 'DISABLED') return studioDisabledResponse()
    return studioErrorResponse(err)
  }
}
