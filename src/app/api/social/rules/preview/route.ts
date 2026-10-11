/** POST /api/social/rules/preview — dry run (never publishes): matching news + why others are excluded. */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json, readJsonBody } from '@/lib/social/accounts/connect/routeHelpers'
import { previewRuleForActor } from '@/lib/social/actorSocial'
import { validateRuleInput } from '@/lib/social/automation/types'
import { extractImageUrl, isOwnContent, isSkippableForSocial } from '@/lib/social/publishOneSocial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const v = validateRuleInput(await readJsonBody(request))
  if (!v.ok) return json({ error: v.message, field: v.field, code: 'invalid_rule' }, 400)
  const r = await previewRuleForActor(auth.actor, v.value, { isOwnContent, isSkippableForSocial, extractImageUrl })
  if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
  return json({ ...r, note: 'Önizleme paylaşım yapmaz. Kural açıldığında yalnızca açıldıktan SONRA yayımlananlar değerlendirilir.' })
}
