/**
 * POST /api/admin/social/agent/backfill — geçmiş elle paylaşımları vekil editörün
 * karar kaydına aktarır (Görev 43 B1). Yalnızca merkez hesap yöneticisi. Yayım yok.
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { backfillDecisionsFromAudit } from '@/lib/social/agent/backfill'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const r = await backfillDecisionsFromAudit()
  await writeSocialAudit({
    actorId: auth.ctx.uid,
    action: 'social.agent.backfill',
    entityType: 'socialAccount',
    entityId: 'agent',
    meta: r,
  })
  return json(r)
}
