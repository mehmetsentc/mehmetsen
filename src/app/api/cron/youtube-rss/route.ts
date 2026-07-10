import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const CRON_SECRET = process.env.CRON_SECRET?.trim()

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${CRON_SECRET}`
}

/** Sync YouTube channel RSS into news collection (no API key). */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const channelId = process.env.ONYEDI_YOUTUBE_CHANNEL_ID?.trim()
  if (!channelId) {
    return NextResponse.json({ error: 'ONYEDI_YOUTUBE_CHANNEL_ID not configured' }, { status: 500 })
  }

  try {
    const { syncYouTubeRss } = await import('@/lib/youtubeRssSync')
    const result = await syncYouTubeRss(channelId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/cron/youtube-rss]', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 502 })
  }
}

export const POST = GET
