import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminStorage } from '@/lib/firebase/admin'
import { scrapeVideoFromUrl, type ScrapedVideo } from '@/lib/videoScrape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/media/scrape-video
 * Body: { url: string, download?: boolean }
 *
 * Herhangi bir kaynaktan (YouTube, Vimeo, haber sayfası, doğrudan MP4…)
 * video scrap eder. `download: true` ve dosya indirilebilirse Storage'a kopyalar.
 */
export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let url: string
  let download = false
  try {
    const body = (await request.json()) as { url?: string; download?: boolean }
    url = (body.url ?? '').trim()
    download = Boolean(body.download)
    if (!url) throw new Error('empty')
    new URL(url)
  } catch {
    return NextResponse.json({ error: 'Geçersiz URL' }, { status: 400 })
  }

  const result = await scrapeVideoFromUrl(url)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  let video: ScrapedVideo = result.video

  if (download && video.downloadable) {
    try {
      video = await downloadToStorage(video)
    } catch (err) {
      console.warn('[scrape-video] storage download failed:', err)
      // Embed/play URL yine döner; storage opsiyonel
    }
  }

  return NextResponse.json({
    provider: video.provider,
    playUrl: video.playUrl,
    watchUrl: video.watchUrl,
    embedUrl: video.embedUrl,
    thumbnailUrl: video.thumbnailUrl,
    title: video.title,
    downloadable: video.downloadable,
    source: video.source,
    pageUrl: video.pageUrl ?? null,
    alternatives: result.alternatives.map((a) => ({
      provider: a.provider,
      playUrl: a.playUrl,
      watchUrl: a.watchUrl,
      thumbnailUrl: a.thumbnailUrl,
      title: a.title,
    })),
  })
}

async function downloadToStorage(video: ScrapedVideo): Promise<ScrapedVideo> {
  const res = await fetch(video.playUrl, {
    headers: { 'User-Agent': 'NaHaber-Bot/1.0' },
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const contentType = res.headers.get('content-type') ?? 'video/mp4'
  if (!contentType.startsWith('video/') && !/\.(mp4|webm)(\?|$)/i.test(video.playUrl)) {
    throw new Error('Not a video file')
  }

  const MAX = 50 * 1024 * 1024
  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX) throw new Error('File too large')

  const ext =
    new URL(video.playUrl).pathname.match(/\.(mp4|webm|mov|m4v)$/i)?.[1]?.toLowerCase() ?? 'mp4'
  const storagePath = `news-videos/admin/${Date.now()}_scraped.${ext}`

  const adminStorage = getAdminStorage()
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim()
  const bucket = adminStorage.bucket(bucketName)
  const file = bucket.file(storagePath)

  await file.save(Buffer.from(buffer), {
    contentType: contentType.startsWith('video/') ? contentType : `video/${ext}`,
    metadata: { cacheControl: 'public, max-age=31536000' },
    public: true,
  })

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`
  return {
    ...video,
    playUrl: publicUrl,
    watchUrl: publicUrl,
    provider: 'mp4',
    downloadable: false,
  }
}
