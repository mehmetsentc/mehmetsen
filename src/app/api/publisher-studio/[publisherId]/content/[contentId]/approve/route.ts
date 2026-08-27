import { NextResponse } from 'next/server'
import { publisherContentService } from '@/services/publisher/publisherContentService'
import { contentErrorResponse, serializeContent, withContentAuth } from '@/lib/publisher/contentApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string; contentId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { publisherId, contentId } = await context.params
  const auth = await withContentAuth(request, publisherId, 'content:review')
  if ('error' in auth && auth.error) return auth.error
  try {
    const item = await publisherContentService.approve(publisherId, contentId, auth.auth!.user.uid)
    return NextResponse.json({ item: serializeContent(item) })
  } catch (err) {
    return contentErrorResponse(err)
  }
}
