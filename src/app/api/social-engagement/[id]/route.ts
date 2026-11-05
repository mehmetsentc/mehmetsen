/**
 * GET /api/social-engagement/{newsId}?slug=… — public, read-only.
 *
 * Platform counts and EDITOR-APPROVED comments of the social posts made for
 * this news item. CDN-cached (10 min) so page views do not turn into database
 * reads; one Firestore read on a cache miss (plus a slug lookup when the page
 * carries a canonical id). No tokens, account ids or pending comments.
 */
import { NextResponse } from 'next/server'
import { readPublicEngagement } from '@/lib/social/engagement/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE = 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params
  const slug = new URL(request.url).searchParams.get('slug')
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ engagement: null }, { status: 400 })
  try {
    const engagement = await readPublicEngagement(id, slug ? slug.slice(0, 200) : null)
    return NextResponse.json({ engagement }, { headers: { 'Cache-Control': CACHE } })
  } catch {
    // Never break the article page; short cache so a transient error heals quickly.
    return NextResponse.json({ engagement: null }, { headers: { 'Cache-Control': 'public, s-maxage=60' } })
  }
}
