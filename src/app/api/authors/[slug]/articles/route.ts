/**
 * GET /api/authors/[slug]/articles?cursor=&limit=
 * Public cursor pagination for an author's published news.
 */
import { NextResponse } from 'next/server'
import {
  getAuthorByUsername,
  getPostsByAuthorId,
} from '@/services/newsService.server'
import { ROUTES } from '@/constants/routes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ slug: string }> }

function decodeCursor(raw: string | null): number {
  if (!raw) return 0
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export async function GET(request: Request, context: RouteContext) {
  const { slug: rawSlug } = await context.params
  const slug = decodeURIComponent(rawSlug || '')
    .trim()
    .toLocaleLowerCase('tr-TR')

  if (!slug || !/^[a-z0-9._-]{2,40}$/i.test(slug)) {
    return NextResponse.json({ error: 'Invalid author' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const offset = decodeCursor(searchParams.get('cursor'))
  const limit = Math.min(20, Math.max(1, Number(searchParams.get('limit') || 12)))

  const author = await getAuthorByUsername(slug)
  if (!author) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Fetch a window large enough for offset pagination until a composite
  // cursor (publishedAt+id) index is everywhere; cap protects cost.
  const window = await getPostsByAuthorId(author.uid, Math.min(offset + limit + 1, 80))
  const page = window.slice(offset, offset + limit)
  const hasMore = window.length > offset + limit

  return NextResponse.json(
    {
      author: {
        username: author.username,
        displayName: author.displayName,
        href: ROUTES.AUTHOR(author.username),
      },
      posts: page.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        summary: p.summary,
        categoryId: p.categoryId,
        coverImageUrl: p.coverImageUrl,
        publishedAt: p.publishedAt,
        href: ROUTES.NEWS_DETAIL(p.slug),
      })),
      nextCursor: hasMore ? String(offset + limit) : null,
      hasMore,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    }
  )
}
