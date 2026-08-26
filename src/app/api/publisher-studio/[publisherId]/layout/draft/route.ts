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

export async function GET(request: Request, context: RouteContext) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  const { publisherId } = await context.params
  try {
    const { user } = await requireStudioAuth(request, publisherId, 'layout:read')
    const layout = await publisherLayoutService.getDraftLayout(publisherId, user.uid)
    return NextResponse.json(layout)
  } catch (err) {
    if (err instanceof Error && err.message === 'DISABLED') return studioDisabledResponse()
    return studioErrorResponse(err)
  }
}

export async function PUT(request: Request, context: RouteContext) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  const { publisherId } = await context.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const { user } = await requireStudioAuth(request, publisherId, 'layout:edit')
    const layout = await publisherLayoutService.saveDraft(publisherId, user.uid, {
      name: typeof body.name === 'string' ? body.name : undefined,
      themeKey: typeof body.themeKey === 'string' ? (body.themeKey as never) : undefined,
      sections: Array.isArray(body.sections) ? (body.sections as never) : undefined,
    })
    return NextResponse.json(layout)
  } catch (err) {
    if (err instanceof Error && err.message === 'DISABLED') return studioDisabledResponse()
    return studioErrorResponse(err)
  }
}
