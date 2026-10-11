/**
 * GET  /api/social/rules — rules of accounts the user may see.
 * POST /api/social/rules — create (always DISABLED) for an account the user manages, within their scope.
 */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json, readJsonBody } from '@/lib/social/accounts/connect/routeHelpers'
import { createRuleForActor, rulesForActor } from '@/lib/social/actorSocial'
import { validateRuleInput } from '@/lib/social/automation/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireActor(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json({ rules: await rulesForActor(auth.actor) })
}

export async function POST(request: Request) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const v = validateRuleInput(await readJsonBody(request))
  if (!v.ok) return json({ error: v.message, field: v.field, code: 'invalid_rule' }, 400)
  const r = await createRuleForActor(auth.actor, v.value)
  if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
  return json({ rule: r.rule }, 201)
}
