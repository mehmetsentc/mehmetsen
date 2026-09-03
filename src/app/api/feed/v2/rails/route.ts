import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { resolveCategoryFilterIds } from '@/lib/feed/resolveCategoryFilterIds'
import { feedCandidateService } from '@/services/feed/FeedCandidateService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Horizontal engagement rails for a feed-v2 tab (featured + popular).
 */
export async function GET(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ featured: [], popular: [] })
  }

  const auth = await verifyFirebaseIdToken(request)
  const allowed = await isSmartFeedEffectiveForUser(auth?.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'Smart feed disabled' }, { status: 404 })
  }

  const url = new URL(request.url)
  const category = url.searchParams.get('category')?.trim().toLowerCase() || null
  const categoryIds = category ? resolveCategoryFilterIds(category) : null
  const opts = {
    limit: 12,
    cursor: null,
    category,
    categoryIds,
    userId: auth?.uid ?? null,
  }

  try {
    const [featured, popular] = await Promise.all([
      feedCandidateService.fetchFeatured(opts),
      feedCandidateService.fetchPopular(opts),
    ])

    const toRail = (rows: typeof featured) =>
      rows.slice(0, 10).map((r) => ({
        articleId: r.articleId,
        slug: r.slug,
        headline: r.headline,
        image: r.image,
        category: r.category,
        publishedAt: r.publishedAt.toISOString(),
      }))

    return NextResponse.json({
      featured: toRail(featured),
      popular: toRail(popular),
    })
  } catch (err) {
    console.error('[api/feed/v2/rails]', err)
    return NextResponse.json({ featured: [], popular: [] })
  }
}
