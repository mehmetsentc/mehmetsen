import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { requireStudioAuth, studioDisabledResponse, studioErrorResponse } from '@/lib/publisher/studioApi'
import { publisherService } from '@/services/publisher/publisherService'

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
  const url = new URL(request.url)
  const limit = Number(url.searchParams.get('limit') ?? 24)
  const cursor = url.searchParams.get('cursor')
  const sort = url.searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest'
  const category = url.searchParams.get('category')
  const sourceId = url.searchParams.get('sourceId')

  try {
    await requireStudioAuth(request, publisherId, 'articles:read')
    const page = await publisherService.getPublisherArticles(publisherId, limit, cursor)
    let items = page.items
    if (sourceId) items = items.filter((a) => a.sourceId === sourceId)
    if (sort === 'oldest') {
      items = [...items].sort(
        (a, b) => (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0)
      )
    }
    if (category) {
      items = items.filter((a) => (a as { categorySlug?: string }).categorySlug === category)
    }
    return NextResponse.json({ items, nextCursor: page.nextCursor })
  } catch (err) {
    if (err instanceof Error && err.message === 'DISABLED') return studioDisabledResponse()
    return studioErrorResponse(err)
  }
}
