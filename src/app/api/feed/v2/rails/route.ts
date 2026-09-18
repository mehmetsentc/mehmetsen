import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { filterRailItemsForCity } from '@/lib/feed/scopeFeedRailsToCity'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import {
  resolveCategoryFilterIds,
  resolveLockedCityCategoryFilterIds,
} from '@/lib/feed/resolveCategoryFilterIds'
import { resolveTenant } from '@/lib/tenant'
import { feedCandidateService } from '@/services/feed/FeedCandidateService'
import type { FeedCandidateRow } from '@/types/smartFeed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toRail(rows: FeedCandidateRow[]) {
  return rows.slice(0, 10).map((r) => ({
    articleId: r.articleId,
    slug: r.slug,
    headline: r.headline,
    image: r.image,
    category: r.category,
    citySlug: r.citySlug ?? null,
    publishedAt: r.publishedAt.toISOString(),
  }))
}

/**
 * Horizontal engagement rails for a feed-v2 tab (featured + popular).
 * City tenants (Çanakkale / Antalya) use the local corpus only.
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
  const hostCity = await getCitySlugFromHeaders()
  const tenant = hostCity ? await resolveTenant(hostCity) : null
  const hostCitySlug = tenant?.provinceSlug ?? hostCity ?? null
  const queryCity = url.searchParams.get('city')?.trim() || null
  const lockCity =
    url.searchParams.get('lockCity') === '1' || Boolean(hostCitySlug)
  const citySlug = (hostCitySlug || queryCity)?.trim().toLowerCase() || null
  const categoryIds = category
    ? lockCity
      ? resolveLockedCityCategoryFilterIds(category)
      : resolveCategoryFilterIds(category)
    : null
  const opts = {
    limit: 12,
    cursor: null,
    category,
    categoryIds,
    userId: auth?.uid ?? null,
    citySlug,
  }

  try {
    if (lockCity && citySlug) {
      const local = filterRailItemsForCity(
        await feedCandidateService.fetchLocal({ ...opts, limit: 16 }),
        citySlug
      )
      const featuredRows = local.filter((row) => row.isFeatured || row.isEditorPick)
      const featuredIds = new Set(featuredRows.map((row) => row.articleId))
      const popularRows = local.filter((row) => !featuredIds.has(row.articleId))
      return NextResponse.json({
        featured: toRail(featuredRows.length > 0 ? featuredRows : local),
        popular: toRail(popularRows),
      })
    }

    const [featured, popular] = await Promise.all([
      feedCandidateService.fetchFeatured(opts),
      feedCandidateService.fetchPopular(opts),
    ])

    return NextResponse.json({
      featured: toRail(featured),
      popular: toRail(popular),
    })
  } catch (err) {
    console.error('[api/feed/v2/rails]', err)
    return NextResponse.json({ featured: [], popular: [] })
  }
}
