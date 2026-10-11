/**
 * PATCH  /api/social/rules/[id]  { action: 'enable' (needs confirm: true) | 'disable' } | { rule }
 * DELETE /api/social/rules/[id]  (disabled rules only)
 * Only the account's owner / manager. "Otomasyonu durdur" never touches manual publishing.
 */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json, readJsonBody } from '@/lib/social/accounts/connect/routeHelpers'
import { deleteRuleForActor, setRuleEnabledForActor, updateRuleForActor } from '@/lib/social/actorSocial'
import { isRuleId } from '@/lib/social/automation/ruleStore'
import { validateRuleInput } from '@/lib/social/automation/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  if (!isRuleId(id)) return json({ error: 'Kural bulunamadı', code: 'not_found' }, 404)
  const body = await readJsonBody(request)
  if (body.action === 'enable' || body.action === 'disable') {
    if (body.action === 'enable' && body.confirm !== true) {
      return json({ error: 'Otomasyonu açmak için hedef hesap ve koşulları onaylayın', code: 'confirm_required' }, 400)
    }
    const r = await setRuleEnabledForActor(auth.actor, id, body.action === 'enable')
    if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
    return json({ rule: r.rule, cancelledJobs: r.cancelledJobs })
  }
  const v = validateRuleInput(body.rule)
  if (!v.ok) return json({ error: v.message, field: v.field, code: 'invalid_rule' }, 400)
  const r = await updateRuleForActor(auth.actor, id, v.value)
  if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
  return json({ rule: r.rule })
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  if (!isRuleId(id)) return json({ error: 'Kural bulunamadı', code: 'not_found' }, 404)
  const r = await deleteRuleForActor(auth.actor, id)
  if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
  return json({ ok: true })
}
