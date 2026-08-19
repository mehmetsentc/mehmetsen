import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { isAnalyticsNeonIngestEnabled } from '@/services/analytics/neonAnalytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Hourly/daily fold is a no-op until ingest is enabled. Does not scan raw production traffic. */
export async function GET(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    ok: true,
    ingestEnabled: isAnalyticsNeonIngestEnabled(),
    skipped: isAnalyticsNeonIngestEnabled() ? false : 'ingest-disabled',
    note: 'CMS reads aggregates only. Production tracking remains off.',
  })
}

export const POST = GET
