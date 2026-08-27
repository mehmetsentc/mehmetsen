import { NextResponse } from 'next/server'
import { publisherContentService } from '@/services/publisher/publisherContentService'
import { contentErrorResponse, serializeContent, withContentAuth } from '@/lib/publisher/contentApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { publisherId } = await context.params
  const auth = await withContentAuth(request, publisherId, 'content:source-import')
  if ('error' in auth && auth.error) return auth.error
  try {
    const body = (await request.json()) as { rawArticleId?: string }
    if (!body.rawArticleId?.trim()) {
      return NextResponse.json({ error: 'rawArticleId required' }, { status: 400 })
    }
    const item = await publisherContentService.importFromSourceArticle(
      publisherId,
      auth.auth!.user.uid,
      body.rawArticleId.trim()
    )
    return NextResponse.json({ item: serializeContent(item) }, { status: 201 })
  } catch (err) {
    return contentErrorResponse(err)
  }
}
