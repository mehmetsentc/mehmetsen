/**
 * GET /api/admin/cron/runs — CMS cron monitor (Admin SDK; bypasses client rules).
 * POST cleanupStuck=1 → running > 10 dk kayıtlarını failed yap.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STUCK_MS = 10 * 60 * 1000

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'cron:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = getAdminFirestore()
    const url = new URL(request.url)
    const cleanup = url.searchParams.get('cleanupStuck') === '1'
    const job = url.searchParams.get('job')?.trim()

    if (cleanup) {
      const snap = await db
        .collection('cronRuns')
        .where('status', '==', 'running')
        .limit(100)
        .get()
      const now = Date.now()
      let cleaned = 0
      const batch = db.batch()
      for (const doc of snap.docs) {
        const startedAt = Number(doc.data().startedAt) || 0
        if (startedAt && now - startedAt < STUCK_MS) continue
        batch.update(doc.ref, {
          status: 'failed',
          finishedAt: now,
          durationMs: startedAt ? now - startedAt : null,
          error: 'Stuck running — timed out / process killed',
        })
        cleaned += 1
      }
      if (cleaned > 0) await batch.commit()
      return NextResponse.json({ cleaned })
    }

    let query = db.collection('cronRuns').orderBy('startedAt', 'desc').limit(100)
    if (job) {
      query = db
        .collection('cronRuns')
        .where('jobName', '==', job)
        .orderBy('startedAt', 'desc')
        .limit(50)
    }
    const snap = await query.get()
    const runs = snap.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        jobName: data.jobName as string,
        status: data.status as string,
        startedAt: data.startedAt,
        finishedAt: data.finishedAt ?? null,
        durationMs: data.durationMs ?? null,
        itemsProcessed: data.itemsProcessed ?? null,
        error: data.error ?? null,
        triggeredBy: data.triggeredBy ?? 'schedule',
        result: typeof data.result === 'string' ? data.result.slice(0, 400) : null,
      }
    })

    const pendingQueue = await db
      .collection('newsQueue')
      .where('status', '==', 'pending')
      .limit(200)
      .get()

    return NextResponse.json({
      runs,
      queuePending: pendingQueue.size,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
