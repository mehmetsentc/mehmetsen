import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { archiveEditor } from '@/services/newsroom/archiveEditor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

let inFlight: Promise<Awaited<ReturnType<typeof archiveEditor.run>>> | null = null

export async function GET(request: Request) {
  return handleRun(request)
}

export async function POST(request: Request) {
  return handleRun(request)
}

function parseIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.floor(n), min), max)
}

async function handleRun(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const days = parseIntParam(url.searchParams.get('days'), 90, 1, 120)
  const maxAiCalls = parseIntParam(url.searchParams.get('maxAiCalls'), 20, 1, 100)

  try {
    if (!inFlight) {
      inFlight = archiveEditor.run({ days, maxAiCalls }).finally(() => {
        inFlight = null
      })
    }
    const result = await inFlight
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[api/cron/newsroom/archive] failed:', error)
    const message = error instanceof Error ? error.message : 'Archive run failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
