/**
 * POST /api/admin/purge-dead-videos
 *
 * YouTube kanalı askıya alındığında Firestore'da kalan geçersiz video
 * belgelerini tespit eder ve siler (veya arşive taşır).
 *
 * Mantık:
 *   - source === 'YouTube' olan belgeler alınır
 *   - Her belgenin YouTube video ID'si çıkarılır
 *   - YouTube oEmbed API ile embeddability kontrol edilir (API key gerektirmez)
 *   - 404 / embed engeli → belgeyi status:'archived' yapar
 *
 * Auth: super_admin veya managing_editor (news:publish yetkisi)
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BATCH_LIMIT = 100
const YT_OEMBED = 'https://www.youtube.com/oembed?format=json&url='

function extractYouTubeVideoId(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube-nocookie\.com\/embed\/|youtube\.com\/embed\/|youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/)
  return m?.[1] ?? null
}

async function isVideoEmbeddable(videoId: string): Promise<'ok' | 'blocked' | 'missing'> {
  try {
    const url = `${YT_OEMBED}https://www.youtube.com/watch?v=${videoId}`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
      headers: { 'User-Agent': 'NaHaber-VideoCheck/1.0' },
    })
    if (res.status === 404) return 'missing'
    if (res.status === 401 || res.status === 403) return 'blocked'
    if (!res.ok) return 'blocked'
    return 'ok'
  } catch {
    return 'blocked'
  }
}

export async function POST(request: Request) {
  try {
    await verifyCmsToken(request, 'news:publish')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminFirestore()

  // Fetch YouTube RSS-synced videos (identified by rssFingerprint prefix)
  const snap = await db
    .collection('news')
    .where('source', '==', 'YouTube')
    .where('status', '==', 'published')
    .limit(BATCH_LIMIT)
    .get()

  if (snap.empty) {
    return NextResponse.json({ checked: 0, archived: 0, ok: 0, blocked: 0 })
  }

  let archived = 0
  let ok = 0
  let blocked = 0
  const batch = db.batch()

  await Promise.allSettled(
    snap.docs.map(async (doc) => {
      const data = doc.data()
      // Extract video ID from mediaItems[0].url or sourceUrl
      const mediaUrl = Array.isArray(data.mediaItems) ? data.mediaItems[0]?.url : null
      const videoId = extractYouTubeVideoId(mediaUrl) ?? extractYouTubeVideoId(data.sourceUrl)

      if (!videoId) return

      const result = await isVideoEmbeddable(videoId)
      if (result === 'ok') {
        ok++
      } else if (result === 'missing') {
        // Video deleted — archive the document
        batch.update(doc.ref, {
          status: 'archived',
          archivedReason: 'youtube_video_deleted',
          archivedAt: new Date().toISOString(),
        })
        archived++
      } else {
        // Embedding blocked but video exists — keep as-is (shows YouTube link fallback)
        blocked++
      }
    })
  )

  if (archived > 0) {
    await batch.commit()
  }

  return NextResponse.json({
    checked: snap.docs.length,
    archived,
    ok,
    blocked,
    message: archived > 0
      ? `${archived} dead video archived, ${ok} ok, ${blocked} embed-blocked`
      : `All ${ok} videos ok, ${blocked} embed-blocked (not deleted)`,
  })
}
