import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { isFeedReaderEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { buildPilotIdentityDebug } from '@/lib/feed/reader/pilotIdentityAuthority.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Client bootstrap: is Feed Reader V1 effective for this user? */
export async function GET(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ enabled: false, reason: 'no_db' })
  }
  const auth = await verifyFirebaseIdToken(request)
  const enabled = await isFeedReaderEffectiveForUser(auth?.uid ?? null)
  const url = new URL(request.url)
  const readerDebug = url.searchParams.get('readerDebug') === '1'

  const body: Record<string, unknown> = {
    enabled,
    feature: 'FEED_READER_V1',
    globalDefault: false,
    /** Non-sensitive: whether an authenticated identity was verified (no uid). */
    authenticated: Boolean(auth?.uid),
  }

  if (readerDebug) {
    body.identityDebug = await buildPilotIdentityDebug({
      authenticatedUid: auth?.uid ?? null,
    })
  }

  return NextResponse.json(body)
}
