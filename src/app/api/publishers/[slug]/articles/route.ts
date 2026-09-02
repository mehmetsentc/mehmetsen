import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isPublisherPlatformEnabled } from '@/lib/publisher/featureFlag'
import { publisherService } from '@/services/publisher/publisherService'

export const dynamic = 'force-dynamic'

/**
 * Public publisher news page — read-only.
 * Cursor pagination for Pinterest grid load-more.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }

  const slug = decodeURIComponent((await ctx.params).slug).trim().toLowerCase()
  if (!slug) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (!isPublisherPlatformEnabled()) {
    const { publisherRepository } = await import('@/services/publisher/publisherRepository')
    const { isPlatformEffectiveForPublisher } = await import('@/lib/publisher/effectiveFlags')
    const row = await publisherRepository.findBySlug(slug)
    if (!row || !(await isPlatformEffectiveForPublisher(row.id))) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
  }

  const publisher = await publisherService.getPublisherBySlug(slug)
  if (!publisher) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const category = url.searchParams.get('category')
  const limitRaw = Number(url.searchParams.get('limit') ?? '30')
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 30, 1), 48)

  const page = await publisherService.getPublisherArticles(publisher.id, limit, cursor, {
    categoryId: category && category !== 'all' ? category : null,
  })

  return NextResponse.json({
    items: page.items.map((i) => ({
      ...i,
      publishedAt: i.publishedAt ? i.publishedAt.toISOString() : null,
    })),
    nextCursor: page.nextCursor,
  })
}
