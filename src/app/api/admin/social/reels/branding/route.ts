/**
 * BRAND-CITY-1 — il / kategori ses, renk ve müzik profili.
 * GET  /api/admin/social/reels/branding → ayarlar + seçenekler
 * POST /api/admin/social/reels/branding { enabled?, groups?, cities? } → kaydet (denetim kaydı)
 * POST /api/admin/social/reels/branding { action: 'suggest' } → boş illere öneri (kaydetmez)
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { TURKISH_PROVINCES } from '@/constants/cities'
import {
  ACCENT_PALETTE,
  BRAND_GROUPS,
  parseCityBranding,
  suggestCityProfiles,
  VOICE_POOL,
  type CityBranding,
} from '@/lib/reels/cityBranding'
import { parsePersonas, personaFor } from '@/lib/reels/personas'
import { REEL_MUSIC } from '@/lib/reels/reelTheme'
import { getReelVoiceSettings, listTurkishVoices, saveReelVoiceSettings } from '@/lib/reels/voiceSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function view() {
  const s = await getReelVoiceSettings()
  const personas = parsePersonas(s.personas)
  const catalog = await listTurkishVoices().catch(() => ({ voices: [], source: 'static' as const }))
  return {
    branding: s.cityBranding ?? parseCityBranding(null),
    provinces: TURKISH_PROVINCES.map((p) => ({ slug: p.slug, name: p.name })),
    groups: BRAND_GROUPS.map((g) => {
      const p = personaFor(personas, g.id)
      return { ...g, presenter: { name: p.name, title: p.title, voice: p.voice } }
    }),
    voices: catalog.voices.length ? catalog.voices.map((v) => v.name) : VOICE_POOL.map((v) => v.voice),
    pool: VOICE_POOL.map((v) => v.voice),
    music: REEL_MUSIC.filter((m) => m !== 'auto'),
    palette: [...ACCENT_PALETTE],
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
  const cur = (await getReelVoiceSettings()).cityBranding ?? parseCityBranding(null)

  if (b.action === 'suggest') {
    const filled = suggestCityProfiles(TURKISH_PROVINCES, cur.cities)
    return json({ suggestion: { ...cur, cities: filled } satisfies CityBranding })
  }

  const next = parseCityBranding({
    enabled: 'enabled' in b ? b.enabled === true : cur.enabled,
    groups: b.groups && typeof b.groups === 'object' ? b.groups : cur.groups,
    cities: b.cities && typeof b.cities === 'object' ? b.cities : cur.cities,
  })
  await saveReelVoiceSettings({ cityBranding: next }, auth.ctx.uid)

  const changed = TURKISH_PROVINCES.map((p) => p.slug).filter(
    (slug) => JSON.stringify(cur.cities[slug] ?? null) !== JSON.stringify(next.cities[slug] ?? null)
  )
  await writeSocialAudit({
    actorId: auth.ctx.uid,
    action: 'social.branding.update',
    entityType: 'socialConfig',
    entityId: 'cityBranding',
    meta: {
      enabled: next.enabled,
      enabledChanged: cur.enabled !== next.enabled,
      groups: next.groups,
      cities: Object.keys(next.cities).length,
      changedCities: changed.slice(0, 40),
      changedCount: changed.length,
    },
  }).catch((err) => console.warn('[branding] audit failed:', err instanceof Error ? err.message : err))
  return json(await view())
}
