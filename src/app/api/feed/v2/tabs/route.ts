import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { buildFallbackFeedV2Tabs, buildFeedV2Tabs } from '@/lib/feed/feedV2Tabs'
import { getCategoryFreshnessOrder } from '@/services/feed/feedCategoryFreshness'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ tabs: buildFallbackFeedV2Tabs() })
  }

  const auth = await verifyFirebaseIdToken(request)
  const allowed = await isSmartFeedEffectiveForUser(auth?.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'Smart feed disabled' }, { status: 404 })
  }

  try {
    const ordered = await getCategoryFreshnessOrder()
    return NextResponse.json(
      { tabs: buildFeedV2Tabs(ordered) },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
        },
      }
    )
  } catch {
    return NextResponse.json({ tabs: buildFallbackFeedV2Tabs() })
  }
}
