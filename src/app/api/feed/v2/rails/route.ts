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
 * FinOps 3 Oct: rails are not personal (featured/popular ignore userId) but ran on
 * every article view, often reading 80–290 Firestore docs and returning nothing.
 * Keep each (category, city, lockCity) answer in-process for 5 minutes.
 */
const RAILS_TTL_MS = 5 * 60 * 1000
const RAILS_CACHE_MAX = 64
const railsCache = new Map<string, { at: number; body: { featured: unknown; popular: unknown } }>()

function rememberRails(key: string, body: { featured: unknown; popular: unknown }) {
  railsCache.delete(key)
  railsCache.set(key, { at: Date.now(), body })
  while (railsCache.size > RAILS_CACHE_MAX) {
    const oldest = railsCache.keys().next().value
    if (oldest === undefined) break
    railsCache.delete(oldest)
  }
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

  const cacheKey = `${category ?? ''}|${citySlug ?? ''}|${lockCity ? 1 : 0}`
  const hit = railsCache.get(cacheKey)
  if (hit && Date.now() - hit.at < RAILS_TTL_MS) {
    return NextResponse.json(hit.body)
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
      const body = {
        featured: toRail(featuredRows.length > 0 ? featuredRows : local),
        popular: toRail(popularRows),
      }
      rememberRails(cacheKey, body)
      return NextResponse.json(body)
    }

    const [featured, popular] = await Promise.all([
      feedCandidateService.fetchFeatured(opts),
      feedCandidateService.fetchPopular(opts),
    ])

    const body = {
      featured: toRail(featured),
      popular: toRail(popular),
    }
    rememberRails(cacheKey, body)
    return NextResponse.json(body)
  } catch (err) {
    console.error('[api/feed/v2/rails]', err)
    return NextResponse.json({ featured: [], popular: [] })
  }
}
