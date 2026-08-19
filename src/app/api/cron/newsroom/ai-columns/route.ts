import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { runDailyColumnGeneration } from '@/lib/ai/editorial/columnGenerator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { isLegacyDirectAiEnabled } = await import('@/services/crawler/legacyFlags')
    if (!isLegacyDirectAiEnabled()) {
      return NextResponse.json({
        success: true,
        mode: 'legacy_disabled',
        aiRequests: 0,
        generated: 0,
        reason: 'LEGACY_DIRECT_AI_ENABLED=false',
      })
    }
    const result = await runDailyColumnGeneration(5)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}
