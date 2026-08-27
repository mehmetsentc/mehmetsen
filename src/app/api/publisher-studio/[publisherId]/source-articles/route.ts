import { NextResponse } from 'next/server'
import { publisherContentService } from '@/services/publisher/publisherContentService'
import { contentErrorResponse, withContentAuth } from '@/lib/publisher/contentApi'

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
    const items = await publisherContentService.listSourceArticles(
      publisherId,
      auth.auth!.user.uid
    )
    return NextResponse.json({
      items: items.map((i) => ({
        ...i,
        publishedAt: i.publishedAt?.toISOString() ?? null,
      })),
    })
  } catch (err) {
    return contentErrorResponse(err)
  }
}
