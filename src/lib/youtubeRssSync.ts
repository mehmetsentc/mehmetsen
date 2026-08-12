/**
 * Sync YouTube channel RSS feed entries (no API key required).
 * Channel RSS: https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
 *
 * Önemli: YouTube açıklamaları genelde <![CDATA[...]]> içinde gelir.
 * Eski regex yalnızca [^<]* aldığı için açıklama boş kalıyor → spot/content boş
 * yayınlar CMS'te "içerik yok" olarak görünüyordu.
 */

import { shouldSkipYouTubeRssEntry } from '@/lib/liveBroadcastDetect'

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
  drafted: number
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
}

/** media:description — CDATA veya düz metin */
function extractMediaDescription(block: string): string {
  const cdata = block.match(
    /<media:description[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/media:description>/i
  )
  if (cdata?.[1]) return decodeXmlEntities(cdata[1].trim())

  const plain = block.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/i)
  if (plain?.[1]) {
    return decodeXmlEntities(
      plain[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
  }
  return ''
}

function parseRssEntries(xml: string): RssEntry[] {
  const entries: RssEntry[] = []
  const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []

  for (const block of entryBlocks) {
    const videoId = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim()
    const titleRaw = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim()
    const title = titleRaw
      ? decodeXmlEntities(titleRaw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim())
      : ''
    const publishedAt = block.match(/<published>([^<]+)<\/published>/)?.[1]?.trim()
    const description = extractMediaDescription(block)

    if (videoId && title && publishedAt) {
      entries.push({ videoId, title, publishedAt, description })
    }
  }

  return entries
}

/** Spot + gövde — CMS ve haber detay boş kalmasın */
function buildArticleFields(entry: RssEntry): {
  spot: string
  summary: string
  description: string
  content: string
  hasUsableBody: boolean
} {
  const watchUrl = `https://www.youtube.com/watch?v=${entry.videoId}`
  const desc = entry.description.replace(/\s+/g, ' ').trim()

  if (desc.length >= 80) {
    const spot =
      desc.match(/^(.{40,320}?[.!?…])(?:\s|$)/u)?.[1]?.trim() ||
      desc.slice(0, 280).trim()
    const body = [
      spot,
      '',
      desc.length > spot.length ? desc : '',
      '',
      `Video: ${watchUrl}`,
    ]
      .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
      .join('\n')
      .trim()

    return {
      spot,
      summary: desc.slice(0, 280),
      description: body,
      content: body,
      hasUsableBody: true,
    }
  }

  // Açıklama yok / çok kısa — en azından başlıktan doldur (boş yayın YASAK)
  const spot = `${entry.title.replace(/\s*#Canlı\s*$/i, '').trim()}.`
  const body = [
    spot,
    '',
    'Bu içerik YouTube kanalından otomatik alındı. Ayrıntılar ve görüntüler videoda.',
    '',
    `İzle: ${watchUrl}`,
  ].join('\n')

  return {
    spot,
    summary: entry.title.slice(0, 280),
    description: body,
    content: body,
    // Kısa açıklamasız canlı yayınlar → taslak (AdSense ince içerik)
    hasUsableBody: false,
  }
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
  let drafted = 0

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

    // Canlı yayın / shorts / video-only — NaHaber'de oynatılamayan kaynak videoları atla.
    // Önceden hepsi categoryId=teknoloji ile yayınlanıyordu (yanlış kategori + boş/video-only).
    const gate = shouldSkipYouTubeRssEntry(entry.title, entry.description)
    if (gate.skip) {
      skipped++
      console.log(
        `[youtube-rss] skipped (${gate.reason}): ${entry.title.slice(0, 80)}`
      )
      continue
    }

    const slug = `video-${entry.videoId}`
    const embedUrl = `https://www.youtube.com/embed/${entry.videoId}`
    const thumbnailUrl = `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`
    const fields = buildArticleFields(entry)
    const now = Date.now()

    // Surviving items still need editorial review — never auto-publish as teknoloji.
    const status = 'draft' as const

    await db.collection(Collections.NEWS).add({
      title: entry.title,
      slug,
      summary: fields.summary,
      spot: fields.spot,
      description: fields.description,
      content: fields.content,
      // Do not force teknoloji — YouTube channel mix is usually politics/live, not tech.
      categoryId: 'gundem',
      status,
      source: 'YouTube',
      sourceUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
      mediaItems: [{ type: 'video', url: embedUrl, thumbnailUrl }],
      hasVideo: true,
      videoEmbedUrl: embedUrl,
      coverImageUrl: thumbnailUrl,
      thumbnail: thumbnailUrl,
      rssFingerprint: fingerprint,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      postType: 'video',
      moderationNote:
        'YouTube RSS — otomatik yayın kapalı; canlı/#Canlı/#shorts zaten filtrelendi. Editör onayı gerekir.',
    })

    drafted++
  }

  return { channelId, fetched: entries.length, ingested, skipped, drafted }
}
