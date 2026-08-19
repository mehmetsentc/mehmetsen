import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { describeRescrapePlan, previewBacklogCleanup } from '@/services/crawler/ops/cleanupDryRun'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })

  const execute = new URL(request.url).searchParams.get('execute') === '1'
  if (execute) {
    return NextResponse.json(
      { error: 'Gerçek silme bu fazda kapalı. Yalnızca dry-run.', executed: false },
      { status: 409 }
    )
  }

  const store = new DrizzleCrawlerStore()
  const report = await previewBacklogCleanup(store)
  return NextResponse.json({ ...report, rescrape: describeRescrapePlan() })
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:delete')
  if (!auth || auth.role !== 'super_admin') {
    return NextResponse.json({ error: 'Yalnızca süper admin' }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as { execute?: boolean }
  if (body.execute) {
    return NextResponse.json(
      { error: 'Gerçek backlog silme bu görevde kapalı.', executed: false },
      { status: 409 }
    )
  }
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
  const store = new DrizzleCrawlerStore()
  const report = await previewBacklogCleanup(store)
  return NextResponse.json({ ...report, rescrape: describeRescrapePlan() })
}
