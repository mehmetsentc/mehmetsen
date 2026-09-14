import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { buildFallbackFeedV2Tabs, buildFeedV2Tabs } from '@/lib/feed/feedV2Tabs'
import { getFeedCategoryActivity } from '@/services/feed/feedCategoryFreshness'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Global category freshness for the Feed V2 chip rail — not user-specific. */
export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ tabs: buildFallbackFeedV2Tabs() })
  }

  try {
    const { order, activity } = await getFeedCategoryActivity()
    return NextResponse.json(
      {
        tabs: buildFeedV2Tabs(order),
        activity,
        cacheTtlSeconds: 90,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
        },
      }
    )
  } catch {
    return NextResponse.json({ tabs: buildFallbackFeedV2Tabs() })
  }
}
