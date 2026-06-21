import { NextRequest, NextResponse } from 'next/server'
import { sendPushNotification } from '@/lib/oneSignal'

/**
 * POST /api/notifications/send
 * Internal endpoint — protected by CRON_SECRET.
 * Called by breaking news workers when a breaking article is published.
 */
export async function POST(req: NextRequest) {
  // Auth: same secret used by Vercel cron jobs
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { title, message, url, imageUrl } = body as {
      title?: string
      message?: string
      url?: string
      imageUrl?: string
    }

    if (!title || !message || !url) {
      return NextResponse.json(
        { error: 'title, message, and url are required' },
        { status: 400 }
      )
    }

    const result = await sendPushNotification({ title, message, url, imageUrl })

    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (err) {
    console.error('[/api/notifications/send] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
