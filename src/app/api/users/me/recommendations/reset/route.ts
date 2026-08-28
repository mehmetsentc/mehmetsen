import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { userFeedPreferences } from '@/db/schema/feedRanking'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { feedInterestAggregator } from '@/services/feed/FeedInterestAggregator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Clears behavioral scores + negative prefs. Does NOT touch follows/saves. */
export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await requireSocialUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await isSmartFeedEffectiveForUser(auth.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'Smart feed disabled' }, { status: 404 })
  }

  await feedInterestAggregator.clearBehavioral(auth.uid)

  const db = getDb()
  await db.delete(userFeedPreferences).where(eq(userFeedPreferences.userId, auth.uid))

  return NextResponse.json({ ok: true })
}
