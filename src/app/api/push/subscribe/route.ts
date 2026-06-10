/**
 * POST /api/push/subscribe
 * Stores a new browser push subscription in Firestore.
 * Body: { endpoint, keys: { p256dh, auth }, expirationTime? }
 */
import { NextResponse } from 'next/server'
import { storePushSubscription } from '@/lib/pushSender.server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { endpoint, keys } = body as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    }

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    await storePushSubscription({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/push/subscribe]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
