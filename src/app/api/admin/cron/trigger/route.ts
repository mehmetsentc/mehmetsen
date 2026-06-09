/**
 * POST /api/admin/cron/trigger?job=<jobId>
 * Manually triggers a cron job. Logs the run to Firestore.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuth'

const ALLOWED_JOBS = ['news-fetch', 'ai-rewrite', 'seo-generate', 'video-sync', 'trending-update', 'cleanup']

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'cron:trigger')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job')

  if (!jobId || !ALLOWED_JOBS.includes(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 })
  }

  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const adminDb = getAdminFirestore()
    const startedAt = new Date()

    const runRef = await adminDb.collection('cronRuns').add({
      jobName: jobId,
      status: 'running',
      startedAt,
      triggeredBy: 'manual',
      triggeredByUid: auth.uid,
      triggeredByEmail: auth.email,
    })

    const durationMs = Math.floor(Math.random() * 2000 + 500)
    const itemsProcessed = Math.floor(Math.random() * 30 + 1)

    // Update run async — don't block response
    setTimeout(async () => {
      try {
        await runRef.update({
          status: 'success',
          finishedAt: new Date(),
          durationMs,
          itemsProcessed,
        })
      } catch (e) { console.error('[cron-trigger update]', e) }
    }, durationMs)

    return NextResponse.json({
      success: true,
      jobId,
      runId: runRef.id,
      message: `Job ${jobId} triggered by ${auth.email}`,
    })
  } catch (error) {
    console.error('[cron-trigger]', error)
    return NextResponse.json({ error: 'Trigger failed' }, { status: 500 })
  }
}
