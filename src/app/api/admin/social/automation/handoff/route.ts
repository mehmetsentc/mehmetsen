/**
 * POST /api/admin/social/automation/handoff { accountId, on, confirm: true }
 * Explicit per-account handoff of the legacy Onyeditivi AUTOMATIC path to
 * account-bound automation (or back). Manual sharing is unaffected; old
 * configuration and history are kept.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { isWellFormedAccountId } from '@/lib/social/accounts/accountStore'
import { setLegacyHandoff } from '@/lib/social/automation/ruleStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  if (!isWellFormedAccountId(body.accountId)) return json({ error: 'Geçersiz hesap', code: 'invalid_account_id' }, 400)
  if (typeof body.on !== 'boolean') return json({ error: 'Geçersiz istek', code: 'invalid' }, 400)
  if (body.confirm !== true) return json({ error: 'Devir için onay gerekli', code: 'confirm_required' }, 400)
  const r = await setLegacyHandoff(body.accountId, body.on, auth.ctx.uid, Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
  return json({ handoffs: r.handoffs })
}
