/**
 * POST/GET /api/cron/newsroom/video-process
 * Cron: every 30 minutes
 * Picks up pending videoQueue items, generates AI scripts, writes to videos collection.
 * Safe to call multiple times (idempotent — items locked to 'processing' before work starts).
 */
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { processVideoQueue } from '@/services/newsroom/video/videoProcessor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handleRun(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processVideoQueue()
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('[api/cron/newsroom/video-process] fatal:', error)
    const message = error instanceof Error ? error.message : 'Video processing failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const GET = handleRun
export const POST = handleRun
