/**
 * GET /api/admin/social/agent — vekil editör durumu (Görev 43):
 *   hesap başına tercih profili, ayarlar, son gölge seçimleri, uyum oranı,
 *   «AI ile yaz» konum/kategori düzeltme özeti.
 * PUT /api/admin/social/agent — hesap ayarı (mod: kapalı | gölge; aralıklar; «Yoktayım»).
 *
 * Yalnızca merkez hesap yöneticisi. Bu aşamada HİÇBİR YOL yayım yapmaz:
 * «onaylı» ve «tam otomatik» modlar reddedilir (B3/B4 ayrı onayla açılacak).
 */
import { actorFromCms } from '@/lib/social/accounts/actor'
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { listManagedAccounts } from '@/lib/social/accounts/connect/flows'
import { toPublicSocialAccount } from '@/lib/social/accounts/types'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { getAdminFirestore } from '@/lib/firebase/admin'
import {
  AI_FIELD_CORRECTIONS_COLLECTION,
  summarizeCorrections,
  type AiFieldChange,
} from '@/lib/ai/feedback/aiFieldCorrections'
import { agreementRate, buildPreferenceProfile, validateSlots, type AgentSettings } from '@/lib/social/agent/core'
import { getAgentSettings, listShadowRuns, loadDecisions, saveAgentSettings } from '@/lib/social/agent/store'
import { agentShadowEnabled } from '@/lib/social/agent/tick'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY = 86_400_000

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const now = Date.now()
  const accounts = ((await listManagedAccounts(actorFromCms(auth.ctx.uid, auth.ctx))) ?? []).map(toPublicSocialAccount)
  const rows = await Promise.all(
    accounts.map(async (a) => {
      const [decisions, settings, runs] = await Promise.all([
        loadDecisions(a.id, now - 60 * DAY),
        getAgentSettings(a.id),
        listShadowRuns(a.id, 60),
      ])
      const profile = buildPreferenceProfile(a.id, decisions, now)
      const last7 = runs.filter((r) => r.windowEnd >= now - 7 * DAY && r.evaluation)
      return {
        account: { id: a.id, platform: a.platform, displayName: a.displayName, username: a.username, status: a.status },
        settings,
        profile,
        agreement7d: agreementRate(last7.map((r) => r.evaluation!)),
        runs: runs.slice(0, 20),
      }
    })
  )
  let corrections: ReturnType<typeof summarizeCorrections> | null = null
  try {
    const snap = await getAdminFirestore()
      .collection(AI_FIELD_CORRECTIONS_COLLECTION)
      .where('createdAt', '>=', new Date(now - 30 * DAY))
      .limit(1000)
      .get()
    corrections = summarizeCorrections(snap.docs.map((d) => d.data() as { changes: AiFieldChange[]; sourceHost?: string }))
  } catch {
    corrections = null
  }
  return json({ shadowEnabled: agentShadowEnabled(), accounts: rows, corrections })
}

export async function PUT(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = (await readJsonBody(request)) as Record<string, unknown> | null
  const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''
  const accounts = (await listManagedAccounts(actorFromCms(auth.ctx.uid, auth.ctx))) ?? []
  if (!accounts.some((a) => a.id === accountId)) return json({ error: 'Hesap bulunamadı', code: 'not_found' }, 404)
  const mode = body?.mode
  if (mode === 'approval' || mode === 'auto') {
    return json(
      { error: 'Onaylı ve tam otomatik vekil henüz açılmadı; önce gölge moddaki uyum oranı izlenecek.', code: 'mode_not_available' },
      409
    )
  }
  if (mode !== 'off' && mode !== 'shadow') return json({ error: 'Geçersiz mod', code: 'invalid_mode' }, 400)
  const slots = validateSlots(body?.slots ?? [])
  if (!slots) return json({ error: 'Aralıklar SS:DD biçiminde olmalı (en fazla 12)', code: 'invalid_slots' }, 400)
  const awayRaw = body?.awayUntil
  const awayUntil = typeof awayRaw === 'number' && awayRaw > Date.now() && awayRaw < Date.now() + 30 * DAY ? awayRaw : null
  const picksRaw = Number(body?.picksPerSlot ?? 3)
  const before = await getAgentSettings(accountId)
  const next: AgentSettings = {
    accountId,
    mode,
    slots,
    awayUntil,
    picksPerSlot: Number.isFinite(picksRaw) ? Math.min(5, Math.max(1, Math.round(picksRaw))) : 3,
    updatedAt: Date.now(),
    updatedBy: auth.ctx.uid,
  }
  await saveAgentSettings(next)
  await writeSocialAudit({
    actorId: auth.ctx.uid,
    action: 'social.agent.settings',
    entityType: 'socialAccount',
    entityId: accountId,
    before: { mode: before.mode, slots: before.slots, awayUntil: before.awayUntil },
    after: { mode: next.mode, slots: next.slots, awayUntil: next.awayUntil },
  })
  return json({ settings: next })
}
