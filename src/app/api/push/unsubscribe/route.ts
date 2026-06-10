/**
 * POST /api/push/unsubscribe
 * Removes a push subscription from Firestore.
 * Body: { endpoint }
 */
import { NextResponse } from 'next/server'
import { removePushSubscription } from '@/lib/pushSender.server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { endpoint } = await request.json() as { endpoint?: string }
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
    await removePushSubscription(endpoint)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/push/unsubscribe]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
