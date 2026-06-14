/**
 * POST /api/admin/cron/trigger?job=<jobId>
 * Manually triggers a real cron job and logs the run to Firestore.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'

// Maps admin-panel job IDs → actual cron API paths
const JOB_ROUTES: Record<string, string> = {
  'news-fetch':        '/api/cron/newsroom/ingest',
  'ai-rewrite':        '/api/cron/newsroom/process-queue',
  'seo-generate':      '/api/cron/newsroom/seo',
  'video-sync':        '/api/cron/newsroom/video-queue',
  'trending-update':   '/api/cron/newsroom/trend',
  'cleanup':           '/api/cron/newsroom/archive',
}

const ALLOWED_JOBS = Object.keys(JOB_ROUTES)

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'cron:trigger')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job')

  if (!jobId || !ALLOWED_JOBS.includes(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 })
  }

  const cronPath = JOB_ROUTES[jobId]
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const adminDb = getAdminFirestore()
    const startedAt = Date.now()

    // Write "running" record
    const runRef = await adminDb.collection('cronRuns').add({
      jobName: jobId,
      cronPath,
      status: 'running',
      startedAt,
      triggeredBy: 'manual',
      triggeredByUid: auth.uid,
      triggeredByEmail: auth.email,
    })

    // Call the real cron endpoint
    const origin = new URL(request.url).origin
    let result: unknown = null
    let status: 'success' | 'failed' = 'success'
    let errorMsg: string | null = null

    try {
      const res = await fetch(`${origin}${cronPath}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secret}`,
          'x-cron-secret': secret,
        },
      })
      result = await res.json()
      if (!res.ok) {
        status = 'failed'
        errorMsg = (result as { error?: string })?.error ?? `HTTP ${res.status}`
      }
    } catch (e) {
      status = 'failed'
      errorMsg = e instanceof Error ? e.message : 'Fetch failed'
    }

    const finishedAt = Date.now()
    const durationMs = finishedAt - startedAt

    await runRef.update({
      status,
      finishedAt,
      durationMs,
      result: result ? JSON.stringify(result).slice(0, 2000) : null,
      ...(errorMsg ? { error: errorMsg } : {}),
    })

    return NextResponse.json({
      success: status === 'success',
      jobId,
      cronPath,
      runId: runRef.id,
      durationMs,
      result,
    })
  } catch (error) {
    console.error('[cron-trigger]', error)
    return NextResponse.json({ error: 'Trigger failed' }, { status: 500 })
  }
}
