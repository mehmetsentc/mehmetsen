/**
 * Sync YouTube channel RSS feed entries (no API key required).
 * Channel RSS: https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
 */

interface RssEntry {
  videoId: string
  title: string
  publishedAt: string
  description: string
}

export interface YouTubeRssSyncResult {
  channelId: string
  fetched: number
  ingested: number
  skipped: number
}

function parseRssEntries(xml: string): RssEntry[] {
  const entries: RssEntry[] = []
  const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []

  for (const block of entryBlocks) {
    const videoId = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim()
    const title = block.match(/<title>([^<]+)<\/title>/)?.[1]?.trim()
    const publishedAt = block.match(/<published>([^<]+)<\/published>/)?.[1]?.trim()
    const description = block.match(/<media:description>([^<]*)<\/media:description>/)?.[1]?.trim() ?? ''

    if (videoId && title && publishedAt) {
      entries.push({ videoId, title, publishedAt, description })
    }
  }

  return entries
}

export async function syncYouTubeRss(channelId: string): Promise<YouTubeRssSyncResult> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'NaHaber-YouTubeRSS/1.0' },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`YouTube RSS fetch failed: ${res.status}`)
  }

  const xml = await res.text()
  const entries = parseRssEntries(xml)

  const { getAdminFirestore, Collections } = await import('@/lib/firebase/admin')
  const db = getAdminFirestore()

  let ingested = 0
  let skipped = 0

  for (const entry of entries.slice(0, 15)) {
    const fingerprint = `youtube-rss:${entry.videoId}`
    const existing = await db
      .collection(Collections.NEWS)
      .where('rssFingerprint', '==', fingerprint)
      .limit(1)
      .get()

    if (!existing.empty) {
      skipped++
      continue
    }

    const slug = `video-${entry.videoId}`
    const publishedMs = Date.parse(entry.publishedAt)
    const embedUrl = `https://www.youtube.com/embed/${entry.videoId}`

    await db.collection(Collections.NEWS).add({
      title: entry.title,
      slug,
      summary: entry.description.slice(0, 300) || entry.title,
      categoryId: 'teknoloji',
      status: 'published',
      source: 'YouTube',
      sourceUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
      videoUrl: embedUrl,
      hasVideo: true,
      coverImageUrl: `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`,
      rssFingerprint: fingerprint,
      publishedAt: Number.isFinite(publishedMs) ? publishedMs : Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      postType: 'video',
    })
    ingested++
  }

  return { channelId, fetched: entries.length, ingested, skipped }
}
