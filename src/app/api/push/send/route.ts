/**
 * POST /api/push/send
 * Admin-only: send a manual push notification to all subscribers.
 * Bearer CRON_SECRET required.
 * Body: { title, body, url?, image?, tag?, breaking?, postId? }
 */
import { NextResponse } from 'next/server'
import { broadcastPush } from '@/lib/pushSender.server'

export const runtime = 'nodejs'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${CRON_SECRET}` && CRON_SECRET.length > 0
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await request.json()
    if (!payload.title || !payload.body) {
      return NextResponse.json({ error: 'title and body required' }, { status: 400 })
    }
    const result = await broadcastPush(payload)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[api/push/send]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
