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

/**
 * Sync one or more YouTube channels into the news collection (no API key).
 *
 * Channel IDs are read from env vars (comma-separated):
 *   YOUTUBE_CHANNEL_IDS=UCxxxxx,UCyyyyy,...
 * Fallback (legacy): ONYEDI_YOUTUBE_CHANNEL_ID
 *
 * To add a new channel: go to the YouTube channel page → View Source → search
 * for "channelId" or "externalId" — copy the UC… value.
 * Then add it to YOUTUBE_CHANNEL_IDS in Vercel env vars.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve channel ID list: YOUTUBE_CHANNEL_IDS takes precedence, fallback to legacy
  const multiIds = process.env.YOUTUBE_CHANNEL_IDS?.trim()
  const legacyId = process.env.ONYEDI_YOUTUBE_CHANNEL_ID?.trim()
  const raw = multiIds || legacyId || ''
  const channelIds = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (channelIds.length === 0) {
    return NextResponse.json(
      { error: 'No YouTube channel IDs configured. Set YOUTUBE_CHANNEL_IDS in Vercel env vars.' },
      { status: 500 }
    )
  }

  try {
    const { syncYouTubeRss } = await import('@/lib/youtubeRssSync')

    const results = await Promise.allSettled(
      channelIds.map((channelId) => syncYouTubeRss(channelId))
    )

    const summary = results.map((r, i) => {
      const channelId = channelIds[i]
      if (r.status === 'fulfilled') {
        return r.value // already contains channelId from syncYouTubeRss
      }
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.error(`[api/cron/youtube-rss] channel ${channelId} failed:`, message)
      return { channelId, error: message }
    })

    const anySuccess = summary.some((s) => !('error' in s))
    return NextResponse.json(
      { channels: summary, totalChannels: channelIds.length },
      { status: anySuccess ? 200 : 502 }
    )
  } catch (err) {
    console.error('[api/cron/youtube-rss]', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 502 })
  }
}

export const POST = GET
