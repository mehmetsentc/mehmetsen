import 'server-only'
/**
 * EVENT-DESK-1 — etkinlik seslendirmesinin sesi: ilin sunucusu (il ses profili açık ve ses tanımlıysa),
 * yoksa sıcak tonlu etkinlik sunucusu (magazin/yaşam sunucusu).
 */
import { getReelVoiceSettings } from '@/lib/reels/voiceSettings'
import { parsePersonas, personaFor } from '@/lib/reels/personas'

export async function eventVoiceFor(citySlug: string): Promise<{ voice: string; rate: number; presenter: string; source: 'city' | 'event' }> {
  const s = await getReelVoiceSettings()
  const city = s.cityBranding?.enabled ? s.cityBranding.cities[citySlug] : undefined
  const fallback = personaFor(parsePersonas(s.personas), 'magazin')
  if (city?.voice) return { voice: city.voice, rate: city.rate ?? fallback.rate, presenter: city.presenterName || fallback.name, source: 'city' }
  return { voice: fallback.voice, rate: fallback.rate, presenter: fallback.name, source: 'event' }
}
