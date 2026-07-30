import { NextRequest, NextResponse } from 'next/server'
import { syncSkorDaily } from '@/lib/skor/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET?.trim()

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${CRON_SECRET}`) return true
  const q = req.nextUrl.searchParams.get('secret') ?? req.nextUrl.searchParams.get('cron_secret')
  return q === CRON_SECRET
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await syncSkorDaily()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron/skor-daily]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export const POST = GET
