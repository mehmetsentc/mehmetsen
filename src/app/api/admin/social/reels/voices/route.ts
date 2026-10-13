/**
 * GET  /api/admin/social/reels/voices → Turkish voice catalog + studio voice settings.
 * POST /api/admin/social/reels/voices { defaultVoice, rate, categoryVoices } → save settings.
 * Listing voices is free (no TTS characters). Auth: central social-account manager.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { reelVoiceConfig } from '@/lib/reels/voice'
import { resolveReelVoice } from '@/lib/reels/voiceRules'
import { getReelVoiceSettings, listTurkishVoices, saveReelVoiceSettings } from '@/lib/reels/voiceSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const [catalog, settings] = await Promise.all([listTurkishVoices(), getReelVoiceSettings()])
  const env = reelVoiceConfig()
  const effective = resolveReelVoice({ settings, env: { voice: process.env.GOOGLE_TTS_VOICE?.trim() || null, rate: env.rate } })
  return json({ voices: catalog.voices, catalogSource: catalog.source, settings, effective, ttsReady: env.ready })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const settings = await saveReelVoiceSettings(body, auth.ctx.uid)
  return json({ settings })
}
