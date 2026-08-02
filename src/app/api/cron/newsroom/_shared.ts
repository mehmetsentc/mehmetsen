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
    // COST PAUSE: cronRuns Firestore logging disabled — logs go to Vercel console instead.
    console.log(`[cron:start] ${label}`)

    try {
      if (!inFlight) {
        inFlight = run().finally(() => {
          inFlight = null
        })
      }
      const result = await inFlight

      console.log(`[cron:done] ${label} durationMs=${Date.now() - startedAt}`)
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`CRON_FAIL[${label}]: ${message}`)
      if (error instanceof Error && error.stack) {
        console.error('CRON_STACK:', error.stack.slice(0, 500))
      }
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return {
    GET: handleRun,
    POST: handleRun,
  }
}
