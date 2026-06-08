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

    try {
      if (!inFlight) {
        inFlight = run().finally(() => {
          inFlight = null
        })
      }
      const result = await inFlight
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      console.error(`[api/cron/newsroom/${label}] failed:`, error)
      const message = error instanceof Error ? error.message : `${label} run failed`
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return {
    GET: handleRun,
    POST: handleRun,
  }
}
