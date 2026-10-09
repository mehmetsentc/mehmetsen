/**
 * GET /api/admin/social/publish-records — publish records awaiting an operator
 * decision (uncertain / expired lease). Central social-account manager only.
 * Read on demand (panel open / refresh); never polled.
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { listUncertainForPanel } from '@/lib/social/accounts/uncertainRecords'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const records = await listUncertainForPanel(Date.now())
  return json({ records })
}
