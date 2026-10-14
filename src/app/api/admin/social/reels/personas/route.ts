/**
 * GET  /api/admin/social/reels/personas → presenters + studio defaults + Gemini budget state.
 * POST /api/admin/social/reels/personas { personas?, geminiEnabled?, geminiMonthlyUsd?, intro?, outro?, music? }
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { parsePersonas } from '@/lib/reels/personas'
import { REEL_INTROS, REEL_MUSIC, REEL_OUTROS } from '@/lib/reels/reelTheme'
import { DIGEST_TRANSITIONS } from '@/lib/reels/renderDigest'
import { usageMonth } from '@/lib/reels/ttsQuotaRules'
import { getReelVoiceSettings, saveReelVoiceSettings } from '@/lib/reels/voiceSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function view() {
  const s = await getReelVoiceSettings()
  const month = usageMonth()
  const u = await getAdminFirestore().collection('ttsUsage').doc(month).get().catch(() => null)
  return {
    personas: parsePersonas(s.personas),
    defaults: { intro: s.intro ?? 'soft', outro: s.outro ?? 'logo', music: s.music ?? 'auto', alwaysUseMedia: s.alwaysUseMedia !== false },
    gemini: { enabled: !!s.geminiEnabled, monthlyUsd: s.geminiMonthlyUsd ?? 10, usedUsd: Number(u?.data()?.geminiUsd ?? 0), month },
    options: { intros: REEL_INTROS, outros: REEL_OUTROS, music: REEL_MUSIC, transitions: DIGEST_TRANSITIONS },
  }
}

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json(await view())
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const b = await readJsonBody(request)
  const patch: Record<string, unknown> = {}
  if (Array.isArray(b.personas)) patch.personas = parsePersonas(b.personas)
  for (const k of ['geminiEnabled', 'geminiMonthlyUsd', 'intro', 'outro', 'music', 'alwaysUseMedia'] as const) if (k in b) patch[k] = b[k]
  await saveReelVoiceSettings(patch, auth.ctx.uid)
  return json(await view())
}
