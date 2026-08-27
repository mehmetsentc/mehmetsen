import { NextResponse } from 'next/server'
import { publisherContentService } from '@/services/publisher/publisherContentService'
import { contentErrorResponse, withContentAuth } from '@/lib/publisher/contentApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string; contentId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { publisherId, contentId } = await context.params
  const auth = await withContentAuth(request, publisherId, 'content:read')
  if ('error' in auth && auth.error) return auth.error
  try {
    const events = await publisherContentService.listAudit(
      publisherId,
      contentId,
      auth.auth!.user.uid
    )
    return NextResponse.json({
      events: events.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    return contentErrorResponse(err)
  }
}
