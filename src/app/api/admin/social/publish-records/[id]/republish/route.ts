/**
 * POST /api/admin/social/publish-records/{recordId}/republish
 *
 * "Platformda kontrol ettim, yeniden yayımla" for ONE uncertain record.
 * Body: { "confirm": "checked_on_platform", "attemptId": "<attempt shown in the panel>" }
 * — explicit operator statement bound to the record's current attempt.
 * Central manager + same-origin; account state and lock re-checked; audited.
 * Never marks anything as published without a platform-returned post id.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { republishUncertainRecord } from '@/lib/social/accounts/uncertainRecords'
import { safeErrorText } from '@/lib/social/safeLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CONFIRM_VALUE = 'checked_on_platform'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await ctx.params
  const body = await readJsonBody(request)
  if (body.confirm !== CONFIRM_VALUE) {
    return json({ error: 'Platformda kontrol ettiğinizi açıkça onaylayın', code: 'confirm_required' }, 400)
  }
  const attemptId = typeof body.attemptId === 'string' && /^[0-9a-f-]{1,64}$/i.test(body.attemptId) ? body.attemptId : ''
  if (!attemptId) return json({ error: 'Kayıt denemesi belirtilmeli — listeyi yenileyin', code: 'attempt_required' }, 400)
  const out = await republishUncertainRecord({ recordId: String(id ?? ''), attemptId, actorUid: auth.ctx.uid, now: Date.now() })
  if (!out.ok) return json({ error: out.message, code: out.code }, out.status)
  const r = out.result
  return json({
    skipped: out.skippedReason,
    result: r
      ? {
          success: r.success,
          code: r.code ?? null,
          ledgerStatus: r.ledgerStatus ?? null,
          platformId: r.success ? (r.platformId ?? null) : null,
          error: r.error ? safeErrorText(r.error) : null,
        }
      : null,
  })
}
