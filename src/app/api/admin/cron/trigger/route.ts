/**
 * POST /api/admin/cron/trigger?job=<jobId>
 * Manually triggers real cron job(s) and logs the run to Firestore.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'

/** Admin panel job ID → one or more cron API paths (sıralı çalışır). */
const JOB_ROUTES: Record<string, string[]> = {
  'news-fetch': [
    '/api/cron/newsroom/breaking',
    '/api/cron/newsroom/gundem',
    '/api/cron/newsroom/process-queue',
  ],
  'ai-rewrite': ['/api/cron/newsroom/process-queue'],
  'seo-generate': ['/api/cron/newsroom/seo'],
  'video-sync': ['/api/cron/newsroom/video-queue'],
  'trending-update': ['/api/cron/newsroom/trend'],
  'cleanup': ['/api/cron/newsroom/expire-breaking'],
  breaking: ['/api/cron/newsroom/breaking'],
  gundem: ['/api/cron/newsroom/gundem'],
  local: ['/api/cron/newsroom/local'],
  national: ['/api/cron/newsroom/national'],
  'process-queue': ['/api/cron/newsroom/process-queue'],
  /** Tüm büyük RSS kaynaklarını tetikle (queue sıfırlama sonrası kullanılır) */
  'full-ingest': [
    '/api/cron/newsroom/breaking',
    '/api/cron/newsroom/anka-breaking',
    '/api/cron/newsroom/sozcu-breaking',
    '/api/cron/newsroom/gundem',
    '/api/cron/newsroom/national',
    '/api/cron/newsroom/local',
    '/api/cron/newsroom/world',
    '/api/cron/newsroom/sports',
    '/api/cron/newsroom/technology',
    '/api/cron/newsroom/finans',
    '/api/cron/newsroom/health',
    '/api/cron/newsroom/aa-content',
    '/api/cron/newsroom/kibris',
    '/api/cron/newsroom/freenews',
    '/api/cron/newsroom/politics',
    '/api/cron/newsroom/process-queue',
  ],
  'anka-breaking': ['/api/cron/newsroom/anka-breaking'],
  'sozcu-breaking': ['/api/cron/newsroom/sozcu-breaking'],
  sports: ['/api/cron/newsroom/sports'],
  world: ['/api/cron/newsroom/world'],
  technology: ['/api/cron/newsroom/technology'],
  finans: ['/api/cron/newsroom/finans'],
  health: ['/api/cron/newsroom/health'],
  'aa-content': ['/api/cron/newsroom/aa-content'],
  kibris: ['/api/cron/newsroom/kibris'],
  freenews: ['/api/cron/newsroom/freenews'],
  politics: ['/api/cron/newsroom/politics'],
}

const ALLOWED_JOBS = Object.keys(JOB_ROUTES)

export async function POST(request: Request) {
  const cmsAuth =
    (await verifyCmsToken(request, 'cron:trigger')) ||
    (await verifyCmsToken(request, 'cron:read'))
  const cronAuth = !cmsAuth && (await isNewsroomAuthorized(request))
  if (!cmsAuth && !cronAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const auth = cmsAuth ?? { uid: 'cron-secret', role: 'super_admin' as const, email: 'system' }

  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('job')

  if (!jobId || !ALLOWED_JOBS.includes(jobId)) {
    return NextResponse.json(
      { error: 'Invalid job id', allowed: ALLOWED_JOBS },
      { status: 400 }
    )
  }

  const cronPaths = JOB_ROUTES[jobId]!
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const adminDb = getAdminFirestore()
    const startedAt = Date.now()

    const runRef = await adminDb.collection('cronRuns').add({
      jobName: jobId,
      cronPaths,
      status: 'running',
      startedAt,
      triggeredBy: 'manual',
      triggeredByUid: auth.uid,
      triggeredByEmail: auth.email,
    })

    const origin = new URL(request.url).origin
    const results: unknown[] = []
    let status: 'success' | 'failed' = 'success'
    let errorMsg: string | null = null

    for (const cronPath of cronPaths) {
      try {
        const res = await fetch(`${origin}${cronPath}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secret}`,
            'x-cron-secret': secret,
          },
          signal: AbortSignal.timeout(110_000),
        })
        const body = await res.json().catch(() => ({ raw: true }))
        results.push({ path: cronPath, http: res.status, body })
        if (!res.ok) {
          status = 'failed'
          errorMsg =
            (body as { error?: string })?.error ?? `HTTP ${res.status} on ${cronPath}`
          break
        }
      } catch (e) {
        status = 'failed'
        errorMsg = `${cronPath}: ${e instanceof Error ? e.message : 'Fetch failed'}`
        results.push({ path: cronPath, error: errorMsg })
        break
      }
    }

    const finishedAt = Date.now()
    await runRef.update({
      status,
      finishedAt,
      durationMs: finishedAt - startedAt,
      result: JSON.stringify(results).slice(0, 3500),
      ...(errorMsg ? { error: errorMsg } : {}),
    })

    return NextResponse.json({
      success: status === 'success',
      jobId,
      cronPaths,
      runId: runRef.id,
      durationMs: finishedAt - startedAt,
      results,
    })
  } catch (error) {
    console.error('[cron-trigger]', error)
    return NextResponse.json({ error: 'Trigger failed' }, { status: 500 })
  }
}
