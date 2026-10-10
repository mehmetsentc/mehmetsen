/** GET /api/admin/social/automation/jobs?days=7 — recent automation jobs (bounded). */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { listRecentJobs } from '@/lib/social/automation/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const url = new URL(request.url)
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 7, 1), 30)
  const jobs = await listRecentJobs({ since: Date.now() - days * 86_400_000, limit: 200 })
  return json({ jobs })
}
