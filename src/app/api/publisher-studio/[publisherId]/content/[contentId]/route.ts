import { NextResponse } from 'next/server'
import { publisherContentService } from '@/services/publisher/publisherContentService'
import {
  contentErrorResponse,
  serializeContent,
  withContentAuth,
} from '@/lib/publisher/contentApi'
import type { PublisherContentDraftInput } from '@/types/publisherContent'

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
    const item = await publisherContentService.get(publisherId, contentId, auth.auth!.user.uid)
    return NextResponse.json({ item: serializeContent(item) })
  } catch (err) {
    return contentErrorResponse(err)
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { publisherId, contentId } = await context.params
  const auth = await withContentAuth(request, publisherId, 'content:write')
  if ('error' in auth && auth.error) return auth.error
  try {
    const body = (await request.json()) as PublisherContentDraftInput & { autosave?: boolean }
    const item = await publisherContentService.saveDraft(
      publisherId,
      contentId,
      auth.auth!.user.uid,
      body,
      { meaningful: !body.autosave }
    )
    return NextResponse.json({ item: serializeContent(item) })
  } catch (err) {
    return contentErrorResponse(err)
  }
}
