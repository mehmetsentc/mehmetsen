import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'

export const newsroomCronConfig = {
  runtime: 'nodejs' as const,
  dynamic: 'force-dynamic' as const,
  maxDuration: 300,
}

export function createNewsroomCronHandler<T>(
  label: string,
  run: () => Promise<T>
) {
  let inFlight: Promise<T> | null = null

  async function handleRun(request: Request) {
    if (!(await isNewsroomAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const startedAt = Date.now()
    let runRef: { id: string; update: (data: Record<string, unknown>) => Promise<void> } | null = null

    // Write a "running" log entry to Firestore (best-effort — don't fail the cron if this errors)
    try {
      const { getAdminFirestore } = await import('@/lib/firebase/admin')
      const adminDb = getAdminFirestore()
      runRef = await adminDb.collection('cronRuns').add({
        jobName: label,
        status: 'running',
        startedAt,
        triggeredBy: 'schedule',
      }) as typeof runRef
    } catch {
      // Non-fatal — cron proceeds even if Firestore logging fails
    }

    try {
      if (!inFlight) {
        inFlight = run().finally(() => {
          inFlight = null
        })
      }
      const result = await inFlight

      // Update log with success
      if (runRef) {
        const finishedAt = Date.now()
        runRef.update({
          status: 'success',
          finishedAt,
          durationMs: finishedAt - startedAt,
          result: JSON.stringify(result).slice(0, 2000),
        }).catch(() => {})
      }

      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      console.error(`[api/cron/newsroom/${label}] failed:`, error)
      const message = error instanceof Error ? error.message : `${label} run failed`

      // Update log with failure
      if (runRef) {
        const finishedAt = Date.now()
        runRef.update({
          status: 'failed',
          finishedAt,
          durationMs: finishedAt - startedAt,
          error: message,
        }).catch(() => {})
      }

      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return {
    GET: handleRun,
    POST: handleRun,
  }
}
