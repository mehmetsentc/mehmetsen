/**
 * GET|POST /api/cron/social-automation — the single shared automation worker
 * tick (every account, every province).
 *
 * Scheduled every 5 minutes in vercel.json (Görev 15 — narrow FINOPS
 * exception, see src/lib/costFreeze.test.ts). CMS publish routes write the
 * job synchronously and start it in after(); this tick is the guarantee.
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
import { runAgentShadowTick } from '@/lib/social/agent/tick'
import { runAccountCenterTick } from '@/lib/accountCenter/store'

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
      `[cron/social-automation] recovered=${report.recovered} scanned=${report.reconcile?.scanned ?? 0} enqueued=${report.reconcile?.enqueued ?? 0} processed=${report.processed.map((p) => `${p.status}:${p.code}`).join(',') || '-'} tokens=${report.tokens ? `${report.tokens.refreshed}/${report.tokens.failed}/${report.tokens.expired}` : '-'} ms=${report.durationMs}`,
    )
    // GÖREV 43 B2: vekil editör gölge modu (yayım yok; bayrakla kapalı)
    let agent: Awaited<ReturnType<typeof runAgentShadowTick>> | null = null
    try {
      agent = await runAgentShadowTick()
      if (agent.enabled && (agent.ran.length || agent.evaluated || agent.errors.length)) {
        console.log(`[cron/social-automation] agent ran=${agent.ran.length} evaluated=${agent.evaluated} errors=${agent.errors.length}`)
      }
    } catch (err) {
      console.error('[cron/social-automation] agent:', safeErrorText(err))
    }
    // Hesap Merkezi otomatik cevap: ACCOUNT_CENTER_AUTO_REPLY=on olmadan hiçbir şey okumaz/yazmaz.
    let accountCenter: Awaited<ReturnType<typeof runAccountCenterTick>> | null = null
    try {
      accountCenter = await runAccountCenterTick(Date.now, { deadline: Date.now() + 60_000 })
      if (accountCenter.enabled) {
        console.log(`[cron/social-automation] account-center evaluated=${accountCenter.evaluated} replied=${accountCenter.replied} errors=${accountCenter.errors}`)
      }
    } catch (err) {
      console.error('[cron/social-automation] account-center:', safeErrorText(err))
    }
    return NextResponse.json({ ...report, agent, accountCenter }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[cron/social-automation] fatal:', safeErrorText(err))
    return NextResponse.json({ error: 'automation tick failed' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
