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

    const wantPendingDetails = url.searchParams.get('pendingDetails') === '1'
    const pendingOffset = parseInt(url.searchParams.get('pendingOffset') ?? '0', 10) || 0
    const pendingLimit = Math.min(
      parseInt(url.searchParams.get('pendingLimit') ?? '50', 10) || 50,
      100
    )

    // Real count via Firestore aggregation (free — no doc reads billed)
    const countSnap = await db
      .collection('newsQueue')
      .where('status', '==', 'pending')
      .count()
      .get()
    const queuePending = countSnap.data().count

    let pendingItems: Array<{
      id: string
      title: string
      source: string
      workerId: string
      category: string | null
      createdAt: number
      attempts: number
      queueDuplicateSuspect?: boolean
      queueDuplicateRole?: string | null
      queueDuplicateOf?: string | null
      queueDuplicateSimilarity?: number | null
      qualityScore?: number | null
      peerQualityScore?: number | null
    }> | undefined

    if (wantPendingDetails) {
      const pSnap = await db
        .collection('newsQueue')
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .offset(pendingOffset)
        .limit(pendingLimit)
        .get()

      pendingItems = pSnap.docs.map((d) => {
        const data = d.data()
        const input = (data.input ?? {}) as Record<string, unknown>
        return {
          id: d.id,
          title: (input.originalTitle as string) ?? '(başlıksız)',
          source: (input.sourceLabel as string) ?? '',
          workerId: (data.workerId as string) ?? '',
          category: (input.forcedCategoryId as string) ?? null,
          createdAt: (data.createdAt as number) ?? 0,
          attempts: (data.attempts as number) ?? 0,
          queueDuplicateSuspect: data.queueDuplicateSuspect === true,
          queueDuplicateRole: (data.queueDuplicateRole as string) ?? null,
          queueDuplicateOf: (data.queueDuplicateOf as string) ?? null,
          queueDuplicateSimilarity:
            typeof data.queueDuplicateSimilarity === 'number'
              ? data.queueDuplicateSimilarity
              : null,
          qualityScore: typeof data.qualityScore === 'number' ? data.qualityScore : null,
          peerQualityScore:
            typeof data.peerQualityScore === 'number' ? data.peerQualityScore : null,
        }
      })
    }

    return NextResponse.json({
      runs,
      queuePending,
      ...(pendingItems ? { pendingItems } : {}),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
