/**
 * POST /api/push/subscribe
 * Stores a browser push subscription (authenticated users only).
 */
import { NextResponse } from 'next/server'
import { storePushSubscription } from '@/lib/pushSender.server'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!checkRateLimit(`push-sub:${auth.uid}:${getClientIp(request)}`, 10, 60_000)) {
    return rateLimitResponse()
  }

  try {
    const body = await request.json()
    const { endpoint, keys } = body as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    }

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    await storePushSubscription({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      userId: auth.uid,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/push/subscribe]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
