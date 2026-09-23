import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { loadFeedReaderArticle } from '@/services/feed/feedReaderArticle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Article body for the mobile home story.
 * Same public-read payload as Feed 2's reader, without the pilot feature flag,
 * so a tap on the home story can open the article for every reader.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { slug: raw } = await ctx.params
  const slug = decodeURIComponent(raw || '').trim()
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  try {
    const result = await loadFeedReaderArticle(slug)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason === 'not_found' ? 'not_found' : 'not_eligible' },
        { status: result.reason === 'not_found' ? 404 : 403 }
      )
    }
    return NextResponse.json({ article: result.article, aiInvolved: false })
  } catch (err) {
    console.error('[home/category-story]', err)
    return NextResponse.json({ error: 'reader_unavailable' }, { status: 503 })
  }
}
