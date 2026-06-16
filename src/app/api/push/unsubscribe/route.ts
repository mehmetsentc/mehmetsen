/**
 * POST /api/push/unsubscribe
 * Removes a push subscription (authenticated users only).
 */
import { NextResponse } from 'next/server'
import { removePushSubscription } from '@/lib/pushSender.server'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { endpoint } = await request.json() as { endpoint?: string }
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
    await removePushSubscription(endpoint, auth.uid)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/push/unsubscribe]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
