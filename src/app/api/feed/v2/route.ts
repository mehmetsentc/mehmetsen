import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { feedService } from '@/services/feed/FeedService'
import type { FeedMode } from '@/types/smartFeed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODES = new Set<FeedMode>(['personal', 'following', 'breaking', 'local'])

function parseMode(raw: string | null): FeedMode {
  const m = (raw ?? 'personal').trim().toLowerCase()
  if (MODES.has(m as FeedMode)) return m as FeedMode
  return 'personal'
}

export async function GET(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await verifyFirebaseIdToken(request)
  const allowed = await isSmartFeedEffectiveForUser(auth?.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'Smart feed disabled' }, { status: 404 })
  }

  const url = new URL(request.url)
  const mode = parseMode(url.searchParams.get('mode'))
  const cursor = url.searchParams.get('cursor')
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw ? Number(limitRaw) : undefined
  const citySlug = url.searchParams.get('city')?.trim() || null
  const districtSlug = url.searchParams.get('district')?.trim() || null
  const region = url.searchParams.get('region')?.trim() || null
  const sessionId = request.headers.get('x-feed-session')?.trim() || null
  const refresh = url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true'
  const debug = process.env.NODE_ENV !== 'production' && url.searchParams.get('debug') === '1'

  if (mode === 'following' && !auth) {
    return NextResponse.json({ error: 'auth_required', items: [], hasMore: false, nextCursor: null, mode }, { status: 401 })
  }

  try {
    const page = await feedService.getFeed({
      userId: auth?.uid ?? null,
      sessionId,
      mode,
      cursor,
      limit,
      citySlug,
      districtSlug,
      region,
      refresh,
    }, { debug })
    return NextResponse.json(page)
  } catch (err) {
    console.error('[api/feed/v2]', err)
    return NextResponse.json({ error: 'feed_unavailable' }, { status: 503 })
  }
}
