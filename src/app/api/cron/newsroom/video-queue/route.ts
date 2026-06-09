/**
 * Video Haber Üretim Kuyruğu — 6 saatte bir çalışır.
 * Yeni haberleri alır, AI video üretim kuyruğuna ekler.
 */
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const QUEUE_LIMIT = 20
const LOOKBACK_HOURS = 6

async function handleRun(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = getAdminFirestore()
    const since = Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000

    // Find recent published news without a video
    const snap = await db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(QUEUE_LIMIT)
      .get()

    let queued = 0
    let skipped = 0

    for (const doc of snap.docs) {
      const data = doc.data()

      // Skip if already queued or has video
      if (data.videoQueued || data.videoUrl?.trim()) { skipped++; continue }

      // Add to video generation queue
      await db.collection('videoQueue').add({
        newsId: doc.id,
        title: data.title ?? '',
        summary: data.summary ?? data.description?.slice(0, 300) ?? '',
        categoryId: data.categoryId ?? 'gundem',
        coverImageUrl: data.coverImageUrl ?? data.thumbnail ?? '',
        status: 'pending',
        createdAt: Date.now(),
        priority: data.isBreaking ? 10 : data.priorityScore ?? 5,
      })

      // Mark as queued so we don't re-queue
      await doc.ref.update({ videoQueued: true, videoQueuedAt: Date.now() })
      queued++
    }

    console.log(`[video-queue] queued=${queued} skipped=${skipped}`)
    return NextResponse.json(
      { queued, skipped, total: snap.size },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('[api/cron/newsroom/video-queue] failed:', error)
    const message = error instanceof Error ? error.message : 'Video queue run failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const GET = handleRun
export const POST = handleRun
