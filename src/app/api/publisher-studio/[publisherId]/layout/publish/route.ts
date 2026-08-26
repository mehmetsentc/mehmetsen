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
  try {
    const { user } = await requireStudioAuth(request, publisherId, 'layout:edit')
    const result = await publisherLayoutService.publish(
      publisherId,
      user.uid,
      typeof body.layoutId === 'string' ? body.layoutId : undefined
    )
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Error && err.message === 'DISABLED') return studioDisabledResponse()
    return studioErrorResponse(err)
  }
}
