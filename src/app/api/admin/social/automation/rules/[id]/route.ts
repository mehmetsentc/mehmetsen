/**
 * PATCH  /api/admin/social/automation/rules/[id]
 *   { action: 'enable' | 'disable' }  — enabling needs `confirm: true` and a publishable account
 *   { rule: {...} }                   — update conditions (target account is immutable)
 * DELETE /api/admin/social/automation/rules/[id] — only a disabled rule.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { summarizeRule } from '@/lib/social/automation/match'
import { deleteRule, isRuleId, setRuleEnabled, updateRule } from '@/lib/social/automation/ruleStore'
import { validateRuleInput } from '@/lib/social/automation/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  if (!isRuleId(id)) return json({ error: 'Kural bulunamadı', code: 'not_found' }, 404)
  const body = await readJsonBody(request)
  const now = Date.now()
  if (body.action === 'enable' || body.action === 'disable') {
    if (body.action === 'enable' && body.confirm !== true) {
      return json({ error: 'Otomasyonu açmak için hedef hesap ve koşulları onaylayın', code: 'confirm_required' }, 400)
    }
    const r = await setRuleEnabled(id, body.action === 'enable', auth.ctx.uid, now)
    if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
    return json({ rule: { ...r.rule, summary: summarizeRule(r.rule) }, cancelledJobs: r.cancelledJobs })
  }
  const v = validateRuleInput(body.rule)
  if (!v.ok) return json({ error: v.message, field: v.field, code: 'invalid_rule' }, 400)
  const r = await updateRule(id, v.value, auth.ctx.uid, now)
  if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
  return json({ rule: { ...r.rule, summary: summarizeRule(r.rule) } })
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  if (!isRuleId(id)) return json({ error: 'Kural bulunamadı', code: 'not_found' }, 404)
  const r = await deleteRule(id, auth.ctx.uid)
  if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
  return json({ ok: true })
}
