import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { isGlobalCrawlerEnabled } from '@/services/crawler/enabled'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { crawlerDashboardSnapshot } from '@/services/crawler/telemetry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasDatabaseUrl()) {
    return NextResponse.json({
      enabled: isGlobalCrawlerEnabled(),
      postgres: false,
      error: 'DATABASE_URL missing',
    })
  }

  const store = new DrizzleCrawlerStore()
  const snapshot = await crawlerDashboardSnapshot(store)
  return NextResponse.json({ postgres: true, ...snapshot })
}
