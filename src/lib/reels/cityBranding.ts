/**
 * BRAND-CITY-1 — il ve kategori bazında ses, renk ve müzik profili (saf, G/Ç yok).
 *
 * Reels her haber için bir kez üretilir; profil haberin iline (citySlug) göre seçilir.
 * Öncelik (üstteki kazanır):
 *   1. Stüdyoda elle yapılan seçim (planReel'de ayrıca uygulanır)
 *   2. Son dakika → kırmızı vurgu + son dakika müziği (mevcut kural)
 *   3. Kategori grubu «her ilde aynı sunucu» (varsayılan: yalnızca spor) → grubun sunucusu
 *   4. İl profili → ilin sunucusu (ad + ses + hız), vurgu rengi, müziği
 *   5. Kategori grubu müziği (ayarlıysa il müziğinden önce gelir)
 *   6. Mevcut stil sunucusu ve otomatik müzik
 *
 * Ayarlar `mediaStudioSettings/reelsVoice.cityBranding` alanında durur (ek okuma yok).
 */
import type { ReelPersona } from './personas'
import type { ReelMusic, ReelStyle } from './reelOptions'

export type CityProfile = {
  /** Ekranda ve kartta görünen sunucu adı. */
  presenterName: string | null
  voice: string | null
  rate: number | null
  music: ReelMusic | null
  /** Vurgu rengi (#rrggbb). */
  accent: string | null
}

export type GroupRule = {
  /** Bu gruptaki haberlerin müziği (boş = il müziği ya da otomatik). */
  music: ReelMusic | null
  /** true → bu grubun sunucusu her ilde aynı (il sesi kullanılmaz). */
  sameEverywhere: boolean
}

export type CityBranding = {
  enabled: boolean
  groups: Record<ReelStyle, GroupRule>
  cities: Record<string, CityProfile>
}

export const BRAND_GROUPS: Array<{ id: ReelStyle; label: string }> = [
  { id: 'haber', label: 'Gündem / genel' },
  { id: 'spor', label: 'Spor' },
  { id: 'magazin', label: 'Magazin / yaşam' },
  { id: 'analiz', label: 'Ekonomi / analiz' },
]

export const DEFAULT_GROUPS: Record<ReelStyle, GroupRule> = {
  haber: { music: null, sameEverywhere: false },
  spor: { music: null, sameEverywhere: true },
  magazin: { music: null, sameEverywhere: false },
  analiz: { music: null, sameEverywhere: false },
}

/** Lacivert zeminde okunaklı vurgu renkleri (marka kırmızısı son dakikaya ayrılmış). */
export const ACCENT_PALETTE = [
  '#0288d1', '#00897b', '#43a047', '#7cb342', '#f9a825', '#fb8c00',
  '#f4511e', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab', '#00acc1',
] as const

/** İllere dağıtılan sesler (Wavenet + Chirp3-HD); Standard sesler daha düz olduğu için havuzda yok. */
export const VOICE_POOL: Array<{ voice: string; gender: 'F' | 'M' }> = [
  { voice: 'tr-TR-Wavenet-A', gender: 'F' },
  { voice: 'tr-TR-Wavenet-B', gender: 'M' },
  { voice: 'tr-TR-Wavenet-C', gender: 'F' },
  { voice: 'tr-TR-Wavenet-D', gender: 'F' },
  { voice: 'tr-TR-Wavenet-E', gender: 'M' },
  { voice: 'tr-TR-Chirp3-HD-Aoede', gender: 'F' },
  { voice: 'tr-TR-Chirp3-HD-Charon', gender: 'M' },
  { voice: 'tr-TR-Chirp3-HD-Fenrir', gender: 'M' },
  { voice: 'tr-TR-Chirp3-HD-Kore', gender: 'F' },
  { voice: 'tr-TR-Chirp3-HD-Leda', gender: 'F' },
  { voice: 'tr-TR-Chirp3-HD-Orus', gender: 'M' },
  { voice: 'tr-TR-Chirp3-HD-Puck', gender: 'M' },
  { voice: 'tr-TR-Chirp3-HD-Zephyr', gender: 'F' },
]

const FEMALE_NAMES = ['Ayşe', 'Zeynep', 'Elif', 'Defne', 'Nil', 'Eda', 'Ceren', 'Duru', 'Ela', 'Melis', 'İpek', 'Su']
const MALE_NAMES = ['Emre', 'Can', 'Burak', 'Mert', 'Kaan', 'Arda', 'Ozan', 'Efe', 'Tolga', 'Onur', 'Barış', 'Umut']
const RATES = [1.0, 1.03, 1.05, 1.07]
const MUSIC_IDS: ReelMusic[] = ['sakin', 'modern', 'akustik', 'kurumsal', 'enerjik', 'sondakika', 'lofi', 'none']

const SLUG_RE = /^[a-z0-9-]{2,40}$/
const COLOR_RE = /^#[0-9a-f]{6}$/i
const VOICE_RE = /^tr-TR-[A-Za-z0-9]+(?:-[A-Za-z0-9]+){1,3}$/

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

function music(v: unknown): ReelMusic | null {
  return typeof v === 'string' && (MUSIC_IDS as string[]).includes(v) ? (v as ReelMusic) : null
}

function rate(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.min(1.3, Math.max(0.85, Math.round(n * 100) / 100))
}

export function parseCityProfile(raw: unknown): CityProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const p: CityProfile = {
    presenterName: str(r.presenterName, 24) || null,
    voice: typeof r.voice === 'string' && r.voice.length <= 64 && VOICE_RE.test(r.voice) ? r.voice : null,
    rate: rate(r.rate),
    music: music(r.music),
    accent: typeof r.accent === 'string' && COLOR_RE.test(r.accent) ? r.accent.toLowerCase() : null,
  }
  return p.presenterName || p.voice || p.rate != null || p.music || p.accent ? p : null
}

export function parseCityBranding(raw: unknown): CityBranding {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const groupsRaw = r.groups && typeof r.groups === 'object' ? (r.groups as Record<string, unknown>) : {}
  const groups = { ...DEFAULT_GROUPS }
  for (const g of BRAND_GROUPS) {
    const x = groupsRaw[g.id]
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>
      groups[g.id] = {
        music: music(o.music),
        sameEverywhere: typeof o.sameEverywhere === 'boolean' ? o.sameEverywhere : DEFAULT_GROUPS[g.id].sameEverywhere,
      }
    }
  }
  const cities: Record<string, CityProfile> = {}
  const citiesRaw = r.cities && typeof r.cities === 'object' ? (r.cities as Record<string, unknown>) : {}
  for (const [slug, v] of Object.entries(citiesRaw).slice(0, 120)) {
    if (!SLUG_RE.test(slug)) continue
    const p = parseCityProfile(v)
    if (p) cities[slug] = p
  }
  return { enabled: r.enabled === true, groups, cities }
}

export type BrandingDecision = {
  persona: ReelPersona
  /** Müzik önerisi; null = mevcut kural (stüdyo varsayılanı / otomatik). */
  music: ReelMusic | null
  /** Vurgu rengi; null = stil rengi (son dakikada her zaman kırmızı). */
  accent: string | null
  /** Neyin uygulandığı (önizleme ve log için). */
  source: { voice: 'city' | 'group' | 'style'; music: 'group' | 'city' | 'default'; accent: 'city' | 'default' }
}

/**
 * Bir haber için ses / müzik / renk kararı.
 * @param persona stil sunucusu (personaFor sonucu)
 */
export function resolveCityBranding(input: {
  branding: CityBranding | null | undefined
  citySlug: string | null | undefined
  cityName?: string | null
  style: ReelStyle
  breaking: boolean
  persona: ReelPersona
}): BrandingDecision {
  const none: BrandingDecision = {
    persona: input.persona,
    music: null,
    accent: null,
    source: { voice: 'style', music: 'default', accent: 'default' },
  }
  const b = input.branding
  if (!b || !b.enabled) return none
  const group = b.groups[input.style] ?? DEFAULT_GROUPS[input.style]
  const city = input.citySlug ? b.cities[input.citySlug] ?? null : null

  let persona = input.persona
  let voiceSource: BrandingDecision['source']['voice'] = 'style'
  if (group.sameEverywhere) {
    voiceSource = 'group'
  } else if (city && (city.voice || city.presenterName)) {
    persona = {
      ...input.persona,
      id: `il-${input.citySlug}`.slice(0, 24),
      name: city.presenterName || input.persona.name,
      title: input.cityName ? `NaHaber ${input.cityName}` : input.persona.title,
      voice: city.voice || input.persona.voice,
      rate: city.rate ?? input.persona.rate,
      // İl sesi Google TTS ile okunur; Gemini sesleri sunucu bazında tanımlı
      useGemini: city.voice ? false : input.persona.useGemini,
      photoUrl: city.presenterName ? null : input.persona.photoUrl,
    }
    voiceSource = 'city'
  }

  let m: ReelMusic | null = null
  let musicSource: BrandingDecision['source']['music'] = 'default'
  if (!input.breaking) {
    if (group.music) {
      m = group.music
      musicSource = 'group'
    } else if (city?.music) {
      m = city.music
      musicSource = 'city'
    }
  }

  const accent = !input.breaking && city?.accent ? city.accent : null
  return { persona, music: m, accent, source: { voice: voiceSource, music: musicSource, accent: accent ? 'city' : 'default' } }
}

/** Haber belgesinden il anahtarı: citySlug, yoksa il adından. */
export function citySlugOf(d: { citySlug?: unknown; city?: unknown }, provinces: ReadonlyArray<{ slug: string; name: string }>): string | null {
  const s = typeof d.citySlug === 'string' ? d.citySlug.trim().toLowerCase() : ''
  if (s && SLUG_RE.test(s)) return s
  const name = typeof d.city === 'string' ? d.city.trim().toLocaleLowerCase('tr-TR') : ''
  if (!name) return null
  const hit = provinces.find((p) => p.name.toLocaleLowerCase('tr-TR') === name)
  return hit ? hit.slug : null
}

type Province = { slug: string; name: string; lat: number; lng: number }

function dist2(a: Province, b: Province): number {
  const dx = (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))
  const dy = a.lat - b.lat
  return dx * dx + dy * dy
}

function pickLeastUsed<T>(options: readonly T[], near: T[], global: Map<T, number>, seed: number): T {
  let best = options[seed % options.length]!
  let bestScore = Infinity
  for (let i = 0; i < options.length; i++) {
    const o = options[(seed + i) % options.length]!
    const score = near.filter((x) => x === o).length * 1000 + (global.get(o) ?? 0)
    if (score < bestScore) {
      best = o
      bestScore = score
    }
  }
  global.set(best, (global.get(best) ?? 0) + 1)
  return best
}

/**
 * 81 il için öneri: komşu illere farklı ses, renk ve ad düşecek şekilde dağıtır.
 * Var olan profiller korunur (keep); yalnızca eksikler doldurulur.
 */
export function suggestCityProfiles(
  provinces: ReadonlyArray<Province>,
  keep: Record<string, CityProfile> = {},
  neighbours = 6
): Record<string, CityProfile> {
  const out: Record<string, CityProfile> = {}
  const voiceUse = new Map<string, number>()
  const colorUse = new Map<string, number>()
  const nameUse = new Map<string, number>()
  const done: Province[] = []
  provinces.forEach((p, idx) => {
    const near = [...done].sort((a, b) => dist2(a, p) - dist2(b, p)).slice(0, neighbours)
    const nearProfiles = near.map((n) => out[n.slug]!).filter(Boolean)
    const existing = keep[p.slug]
    if (existing && existing.voice && existing.accent && existing.presenterName) {
      out[p.slug] = existing
    } else {
      const voice =
        existing?.voice ??
        pickLeastUsed(VOICE_POOL.map((v) => v.voice), nearProfiles.map((x) => x.voice!), voiceUse, idx)
      const gender = VOICE_POOL.find((v) => v.voice === voice)?.gender ?? 'F'
      const names = gender === 'M' ? MALE_NAMES : FEMALE_NAMES
      const presenterName =
        existing?.presenterName ?? pickLeastUsed(names, nearProfiles.map((x) => x.presenterName!), nameUse, idx)
      const accent =
        existing?.accent ?? pickLeastUsed([...ACCENT_PALETTE], nearProfiles.map((x) => x.accent!), colorUse, idx)
      out[p.slug] = {
        presenterName,
        voice,
        rate: existing?.rate ?? RATES[idx % RATES.length]!,
        music: existing?.music ?? null,
        accent,
      }
    }
    done.push(p)
  })
  return out
}

/** Yalnızca vurgu rengi (kapak / kart için; sunucu kararı gerekmez). */
export function cityAccentFor(branding: CityBranding | null | undefined, citySlug: string | null | undefined, breaking: boolean): string | null {
  if (!branding?.enabled || breaking || !citySlug) return null
  return branding.cities[citySlug]?.accent ?? null
}
