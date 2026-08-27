import { NextResponse } from 'next/server'
import { publisherContentService } from '@/services/publisher/publisherContentService'
import {
  contentErrorResponse,
  serializeContent,
  withContentAuth,
} from '@/lib/publisher/contentApi'
import type { PublisherContentStatus } from '@/types/publisherContent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { publisherId } = await context.params
  const auth = await withContentAuth(request, publisherId, 'content:read')
  if ('error' in auth && auth.error) return auth.error
  try {
    const url = new URL(request.url)
    const status = (url.searchParams.get('status') || 'ALL') as PublisherContentStatus | 'ALL'
    const items = await publisherContentService.list(
      publisherId,
      auth.auth!.user.uid,
      status,
      {
        limit: Number(url.searchParams.get('limit') || 40) || 40,
        cursorUpdatedAt: url.searchParams.get('cursor') || null,
        q: url.searchParams.get('q') || null,
        authorId: url.searchParams.get('authorId') || null,
        categoryId: url.searchParams.get('categoryId') || null,
        sourceMode: url.searchParams.get('sourceMode') || null,
      }
    )
    const nextCursor =
      items.length > 0
        ? (typeof items[items.length - 1]!.updatedAt === 'string'
            ? (items[items.length - 1]!.updatedAt as unknown as string)
            : items[items.length - 1]!.updatedAt.toISOString())
        : null
    return NextResponse.json({
      items: items.map(serializeContent),
      nextCursor: items.length >= (Number(url.searchParams.get('limit') || 40) || 40) ? nextCursor : null,
    })
  } catch (err) {
    return contentErrorResponse(err)
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { publisherId } = await context.params
  const auth = await withContentAuth(request, publisherId, 'content:create')
  if ('error' in auth && auth.error) return auth.error
  try {
    const item = await publisherContentService.createDraft(publisherId, auth.auth!.user.uid)
    return NextResponse.json({ item: serializeContent(item) }, { status: 201 })
  } catch (err) {
    return contentErrorResponse(err)
  }
}
