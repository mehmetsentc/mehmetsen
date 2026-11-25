import { NextResponse } from 'next/server'
import { sweepQueuedReelJobs } from '@/lib/reels/reelJobs'

/**
 * GET/POST /api/cron/reel-jobs-sweep  (every 5 minutes, vercel.json)
 *
 * FinOps (25 Nov 2026): safety net for the Railway reel worker. Runs, here on Vercel,
 * queued reel/video jobs that nobody polls (social automation) and that the worker did
 * not pick up within 2 minutes. With the owner flag on 'vercel' nothing is ever queued,
 * so this reads at most a few documents and exits.
 *
 * Auth: Vercel Cron (Bearer CRON_SECRET).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

function isVercelCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`
}

async function handle(request: Request) {
  if (!isVercelCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const ran = await sweepQueuedReelJobs({ max: 2 })
    if (ran.length) console.log(`[cron/reel-jobs-sweep] ran=${ran.join(',')}`)
    return NextResponse.json({ ok: true, ran })
  } catch (err) {
    console.error('[cron/reel-jobs-sweep] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
