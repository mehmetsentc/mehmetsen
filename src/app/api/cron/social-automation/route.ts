/**
 * GET|POST /api/cron/social-automation — the single shared automation worker
 * tick (every account, every province).
 *
 * NOT scheduled in vercel.json: the FINOPS cost freeze keeps vercel.json at
 * the crawler tick only (src/lib/costFreeze.test.ts). It is triggered the same
 * way as the legacy /api/cron/social (external scheduler with the cron secret)
 * once an operator decides to schedule it — every 5 minutes is enough.
 *
 * Auth: Vercel Cron (Bearer CRON_SECRET) or the newsroom cron secret / CMS
 * operator (isNewsroomAuthorized). Blocked in the social test (preview) env.
 * Nothing is published unless a rule is ENABLED; rules are created disabled.
 */
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { testModeAutomationBlock } from '@/lib/social/testEnvironment'
import { safeErrorText } from '@/lib/social/safeLog'
import { runAutomationTick } from '@/lib/social/automation/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isVercelCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`
}

async function handle(request: Request) {
  const testBlock = testModeAutomationBlock()
  if (testBlock) return testBlock
  if (!isVercelCron(request) && !(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const report = await runAutomationTick()
    console.log(
      `[cron/social-automation] recovered=${report.recovered} scanned=${report.reconcile?.scanned ?? 0} enqueued=${report.reconcile?.enqueued ?? 0} processed=${report.processed.map((p) => `${p.status}:${p.code}`).join(',') || '-'} ms=${report.durationMs}`,
    )
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[cron/social-automation] fatal:', safeErrorText(err))
    return NextResponse.json({ error: 'automation tick failed' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
