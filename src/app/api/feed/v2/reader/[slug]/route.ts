import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import {
  isFeedReaderEffectiveForUser,
  isSmartFeedEffectiveForUser,
} from '@/lib/user/effectiveUserFlags'
import { loadFeedReaderArticle } from '@/services/feed/feedReaderArticle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Slim article body for Feed Reader.
 * Gates: SMART_FEED + FEED_READER_V1 + public-read eligibility.
 * Never exposes drafts / rights-blocked / quarantine.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await verifyFirebaseIdToken(request)
  const uid = auth?.uid ?? null

  if (!(await isSmartFeedEffectiveForUser(uid))) {
    return NextResponse.json({ error: 'Smart feed disabled' }, { status: 404 })
  }
  if (!(await isFeedReaderEffectiveForUser(uid))) {
    return NextResponse.json({ error: 'Feed reader disabled', reason: 'feature_off' }, { status: 404 })
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
    console.error('[feed/v2/reader]', err)
    return NextResponse.json({ error: 'reader_unavailable' }, { status: 503 })
  }
}
