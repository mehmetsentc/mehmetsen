/**
 * GET  /api/admin/social/reels/tts-usage → this month's Google TTS characters per
 *      voice type vs the free-tier cap (95% of the free tier).
 * POST { approve: boolean, confirm?: 'UCRETLI_KULLANIMA_ONAY' } → allow / stop going
 *      over the free tier for THIS month only (resets next month).
 * Auth: central social-account manager.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { getTtsUsage, setTtsOverageApproval } from '@/lib/reels/ttsQuota'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json({ usage: await getTtsUsage() })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const approve = body.approve === true
  if (approve && body.confirm !== 'UCRETLI_KULLANIMA_ONAY') {
    return json({ error: 'Ücretli kullanım onayı için açık onay gerekli' }, 400)
  }
  await setTtsOverageApproval(approve, auth.ctx.uid)
  return json({ usage: await getTtsUsage() })
}
