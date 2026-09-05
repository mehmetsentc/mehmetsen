import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { isFeedReaderEffectiveForUser } from '@/lib/user/effectiveUserFlags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Client bootstrap: is Feed Reader V1 effective for this user? */
export async function GET(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ enabled: false, reason: 'no_db' })
  }
  const auth = await verifyFirebaseIdToken(request)
  const enabled = await isFeedReaderEffectiveForUser(auth?.uid ?? null)
  return NextResponse.json({
    enabled,
    feature: 'FEED_READER_V1',
    globalDefault: false,
    /** Non-sensitive: whether an authenticated identity was verified (no uid). */
    authenticated: Boolean(auth?.uid),
  })
}
