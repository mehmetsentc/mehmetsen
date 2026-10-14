import 'server-only'

/**
 * REELS-2 — studio voice settings (Firestore mediaStudioSettings/reelsVoice) and
 * the Turkish voice catalog (Google voices.list, static fallback). Listing voices
 * is free; it does not touch the TTS character quota.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { tierForVoice } from './ttsQuotaRules'
import { parseVoiceSettings, sortVoices, STATIC_TR_VOICES, type ReelVoiceSettings, type VoiceInfo } from './voiceRules'

const DOC_ID = 'reelsVoice'

function doc() {
  return getAdminFirestore().collection(Collections.MEDIA_STUDIO_SETTINGS).doc(DOC_ID)
}

export async function getReelVoiceSettings(): Promise<ReelVoiceSettings> {
  try {
    const s = await doc().get()
    return parseVoiceSettings(s.exists ? s.data() : null)
  } catch (err) {
    console.warn('[reels] voice settings unreadable, using defaults:', err instanceof Error ? err.message : err)
    return parseVoiceSettings(null)
  }
}

export async function saveReelVoiceSettings(raw: unknown, uid: string): Promise<ReelVoiceSettings> {
  // Only the keys the caller sent change; everything else (personas, defaults) is kept.
  const cur = await doc().get().then((x) => (x.exists ? (x.data() as Record<string, unknown>) : {})).catch(() => ({}) as Record<string, unknown>)
  const patch = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const parsed = parseVoiceSettings({ ...cur, ...patch })
  const next = { ...parsed, updatedAt: Date.now(), updatedBy: uid }
  await doc().set(JSON.parse(JSON.stringify(next)))
  return next
}

let catalogCache: { at: number; voices: VoiceInfo[] } | null = null

export async function listTurkishVoices(): Promise<{ voices: VoiceInfo[]; source: 'google' | 'static' }> {
  if (catalogCache && Date.now() - catalogCache.at < 6 * 3600_000) return { voices: catalogCache.voices, source: 'google' }
  const key = process.env.GOOGLE_TTS_API_KEY?.trim()
  if (key) {
    try {
      const res = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=tr-TR&key=${encodeURIComponent(key)}`, {
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const j = (await res.json()) as { voices?: Array<{ name?: string; ssmlGender?: string; languageCodes?: string[] }> }
        const voices = (j.voices ?? [])
          .filter((v) => typeof v.name === 'string' && v.name.startsWith('tr-TR-') && (v.languageCodes ?? []).includes('tr-TR'))
          .map<VoiceInfo>((v) => ({
            name: v.name!,
            gender: v.ssmlGender === 'MALE' || v.ssmlGender === 'FEMALE' || v.ssmlGender === 'NEUTRAL' ? v.ssmlGender : 'UNKNOWN',
            tier: tierForVoice(v.name!),
          }))
        if (voices.length > 0) {
          catalogCache = { at: Date.now(), voices: sortVoices(voices) }
          return { voices: catalogCache.voices, source: 'google' }
        }
      }
    } catch {
      // fall through to the static list
    }
  }
  return { voices: sortVoices(STATIC_TR_VOICES), source: 'static' }
}
