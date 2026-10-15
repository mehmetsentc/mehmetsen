/**
 * REELS-2 — pure voice selection rules for the Reels studio (no I/O).
 * Precedence: per-reel choice > category voice > studio default > env > tr-TR-Standard-D.
 */
export const DEFAULT_REEL_VOICE = 'tr-TR-Standard-D'
export const DEFAULT_REEL_RATE = 1.05
export const PREVIEW_TEXT_DEFAULT = "NaHaber'den son dakika. Çanakkale'de bugün yaşanan gelişmeleri sizin için derledik."
export const PREVIEW_TEXT_MAX = 200

export type ReelVoiceSettings = {
  defaultVoice: string | null
  rate: number | null
  /** categoryId → voice name */
  categoryVoices: Record<string, string>
  /** REELS-4 studio defaults */
  intro?: string | null
  outro?: string | null
  music?: string | null
  /** REELS-5/6/8 Instagram cover look: foto | manset | panel | bulten */
  cover?: string | null
  /** REELS-6/7 reel layout: dinamik | bulten | kart */
  layout?: string | null
  /** REELS-6 post / image-story card theme: nahaber (default) | onyeditivi */
  postTheme?: string | null
  geminiEnabled?: boolean
  geminiMonthlyUsd?: number
  /** Always use the story's own image / video (default true). */
  alwaysUseMedia?: boolean
  personas?: unknown[]
  updatedAt?: number | null
  updatedBy?: string | null
}

export type VoiceInfo = { name: string; gender: 'FEMALE' | 'MALE' | 'NEUTRAL' | 'UNKNOWN'; tier: string }

const VOICE_RE = /^tr-TR-[A-Za-z0-9]+(?:-[A-Za-z0-9]+){1,3}$/

export function isValidVoiceName(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 64 && VOICE_RE.test(v)
}

export function clampRate(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.min(1.5, Math.max(0.75, Math.round(n * 100) / 100))
}

export function emptyVoiceSettings(): ReelVoiceSettings {
  return { defaultVoice: null, rate: null, categoryVoices: {} }
}

/** Parse a stored / submitted settings object; invalid entries are dropped. */
export function parseVoiceSettings(raw: unknown): ReelVoiceSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const cv: Record<string, string> = {}
  const rawCv = r.categoryVoices && typeof r.categoryVoices === 'object' ? (r.categoryVoices as Record<string, unknown>) : {}
  for (const [k, v] of Object.entries(rawCv).slice(0, 60)) {
    if (/^[a-z0-9-]{2,40}$/.test(k) && isValidVoiceName(v)) cv[k] = v
  }
  return {
    defaultVoice: isValidVoiceName(r.defaultVoice) ? r.defaultVoice : null,
    rate: r.rate == null ? null : clampRate(r.rate),
    categoryVoices: cv,
    intro: typeof r.intro === 'string' ? r.intro.slice(0, 16) : null,
    outro: typeof r.outro === 'string' ? r.outro.slice(0, 16) : null,
    music: typeof r.music === 'string' ? r.music.slice(0, 16) : null,
    cover: r.cover === 'foto' || r.cover === 'manset' || r.cover === 'panel' || r.cover === 'bulten' ? r.cover : null,
    layout: r.layout === 'kart' || r.layout === 'bulten' || r.layout === 'dinamik' ? r.layout : null,
    postTheme: r.postTheme === 'nahaber' || r.postTheme === 'onyeditivi' ? r.postTheme : null,
    geminiEnabled: r.geminiEnabled === true,
    alwaysUseMedia: r.alwaysUseMedia !== false,
    geminiMonthlyUsd: Math.min(200, Math.max(0, Number.isFinite(Number(r.geminiMonthlyUsd)) ? Number(r.geminiMonthlyUsd) : 10)),
    personas: Array.isArray(r.personas) ? r.personas.slice(0, 12) : undefined,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : null,
    updatedBy: typeof r.updatedBy === 'string' ? r.updatedBy : null,
  }
}

export function resolveReelVoice(input: {
  settings: ReelVoiceSettings
  env: { voice?: string | null; rate?: number | null }
  categoryId?: string | null
  override?: { voice?: string | null; rate?: number | null }
}): { voice: string; rate: number; source: 'reel' | 'category' | 'default' | 'env' | 'builtin' } {
  const { settings, env, categoryId, override } = input
  const rate = clampRate(override?.rate ?? settings.rate ?? env.rate ?? DEFAULT_REEL_RATE) ?? DEFAULT_REEL_RATE
  if (isValidVoiceName(override?.voice)) return { voice: override!.voice!, rate, source: 'reel' }
  const cat = categoryId ? settings.categoryVoices[categoryId] : undefined
  if (isValidVoiceName(cat)) return { voice: cat, rate, source: 'category' }
  if (isValidVoiceName(settings.defaultVoice)) return { voice: settings.defaultVoice, rate, source: 'default' }
  if (isValidVoiceName(env.voice)) return { voice: env.voice, rate, source: 'env' }
  return { voice: DEFAULT_REEL_VOICE, rate, source: 'builtin' }
}

/** Static Turkish voice list used when the Google voices API is unreachable. */
export const STATIC_TR_VOICES: VoiceInfo[] = [
  ...(['A', 'B', 'C', 'D', 'E'] as const).flatMap((l) => {
    const gender = l === 'B' || l === 'E' ? 'MALE' : 'FEMALE'
    return [
      { name: `tr-TR-Standard-${l}`, gender, tier: 'standard' } as VoiceInfo,
      { name: `tr-TR-Wavenet-${l}`, gender, tier: 'wavenet' } as VoiceInfo,
    ]
  }),
  ...['Aoede', 'Kore', 'Leda', 'Zephyr'].map((n) => ({ name: `tr-TR-Chirp3-HD-${n}`, gender: 'FEMALE', tier: 'chirp' }) as VoiceInfo),
  ...['Charon', 'Fenrir', 'Orus', 'Puck'].map((n) => ({ name: `tr-TR-Chirp3-HD-${n}`, gender: 'MALE', tier: 'chirp' }) as VoiceInfo),
]

const TIER_ORDER = ['standard', 'wavenet', 'neural2', 'chirp', 'studio']

export function sortVoices(list: VoiceInfo[]): VoiceInfo[] {
  return [...list].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.name.localeCompare(b.name))
}

export function previewText(raw: unknown): string {
  const t = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  return (t || PREVIEW_TEXT_DEFAULT).slice(0, PREVIEW_TEXT_MAX)
}
