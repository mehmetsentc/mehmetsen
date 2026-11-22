/**
 * GÖREV 43 B — Vekil editör çekirdeği (saf fonksiyonlar, Firestore yok).
 *
 * 1. Karar kaydı: editörün elle yaptığı her başarılı paylaşım (haber × hesap ×
 *    biçim) bir karar satırıdır.
 * 2. Tercih profili: hesap başına kategori, öne çıkan, saat ve günlük adet
 *    dağılımı. Model eğitilmez; profil kayıtlardan hesaplanır.
 * 3. Gölge seçim: yayın aralığında ajan «ben olsam bunu paylaşırdım» der,
 *    hiçbir şey yayımlamaz. Sonra editörün gerçek seçimiyle karşılaştırılır.
 */
import type { NewsFacts } from '@/lib/social/automation/match'

export type AgentMode = 'off' | 'shadow' | 'approval' | 'auto'
export type DecisionFormat = 'post' | 'story' | 'reel'
export type DecisionPlatform = 'facebook' | 'instagram' | 'threads' | 'twitter' | 'youtube' | 'tiktok'

export interface ShareDecision {
  newsId: string
  accountId: string
  platform: DecisionPlatform
  format: DecisionFormat
  at: number
  actorUid: string | null
  source: 'composer' | 'backfill'
  categoryId: string
  citySlug: string
  featured: boolean
  newsPublishedAt: number | null
}

export function decisionId(d: Pick<ShareDecision, 'newsId' | 'accountId' | 'format'>): string {
  return `${d.newsId}__${d.accountId}__${d.format}`.replace(/\//g, '_').slice(0, 400)
}

type PlatformResult = { success?: boolean; ok?: boolean; accountId?: string | null; account?: string | null } | null | undefined

/**
 * publishOneSocial sonucundan (ya da social.publish.manual denetim kaydının
 * meta alanından) başarılı hedefleri çıkarır. Eski (legacy) kimlikli satırlar
 * hesap kimliği olmadığı için atlanır.
 */
export function successfulTargets(result: {
  post?: Record<string, PlatformResult> | null
  story?: Record<string, PlatformResult> | null
  reel?: Record<string, PlatformResult> | null
}): Array<{ platform: DecisionPlatform; format: DecisionFormat; accountId: string }> {
  const out: Array<{ platform: DecisionPlatform; format: DecisionFormat; accountId: string }> = []
  const formats: Array<[DecisionFormat, Record<string, PlatformResult> | null | undefined]> = [
    ['post', result.post],
    ['story', result.story],
    ['reel', result.reel],
  ]
  for (const [format, group] of formats) {
    if (!group || typeof group !== 'object') continue
    for (const platform of ['facebook', 'instagram', 'threads', 'twitter', 'youtube', 'tiktok'] as const) {
      const r = group[platform]
      if (!r || typeof r !== 'object') continue
      const ok = r.success === true || r.ok === true
      const accountId = (r.accountId ?? r.account ?? '').toString().trim()
      if (ok && accountId && accountId !== 'legacy') out.push({ platform, format, accountId })
    }
  }
  return out
}

// ── Profil ────────────────────────────────────────────────────────────────

export interface PreferenceProfile {
  accountId: string
  samples: number
  /** Kategori → paylaşım payı (0..1). */
  categories: Record<string, number>
  /** 0..23 Europe/Istanbul saat → pay. */
  hours: number[]
  featuredShare: number
  perDay: number
  /** Haber yayını → paylaşım arası medyan dakika. */
  medianDelayMin: number | null
  formats: Record<DecisionFormat, number>
  windowDays: number
  updatedAt: number
}

export const MIN_PROFILE_SAMPLES = 10

export function istanbulHour(ms: number): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(
      new Date(ms)
    )
  ) % 24
}

export function buildPreferenceProfile(
  accountId: string,
  decisions: ShareDecision[],
  now: number,
  windowDays = 60
): PreferenceProfile {
  const since = now - windowDays * 86_400_000
  const rows = decisions.filter((d) => d.accountId === accountId && d.at >= since && d.at <= now)
  // Aynı haber birden çok biçimde paylaşılmışsa tercih için tek seçim sayılır.
  const byNews = new Map<string, ShareDecision>()
  for (const d of rows) if (!byNews.has(d.newsId) || d.at < byNews.get(d.newsId)!.at) byNews.set(d.newsId, d)
  const picks = [...byNews.values()]
  const n = picks.length
  const categories: Record<string, number> = {}
  const hours = new Array(24).fill(0) as number[]
  let featured = 0
  const delays: number[] = []
  for (const p of picks) {
    const c = p.categoryId || 'gundem'
    categories[c] = (categories[c] ?? 0) + 1
    hours[istanbulHour(p.at)] += 1
    if (p.featured) featured += 1
    if (p.newsPublishedAt && p.at >= p.newsPublishedAt) delays.push((p.at - p.newsPublishedAt) / 60_000)
  }
  const formats: Record<DecisionFormat, number> = { post: 0, story: 0, reel: 0 }
  for (const d of rows) formats[d.format] += 1
  const total = rows.length || 1
  for (const k of Object.keys(formats) as DecisionFormat[]) formats[k] = formats[k] / total
  for (const k of Object.keys(categories)) categories[k] = categories[k] / (n || 1)
  delays.sort((a, b) => a - b)
  const activeDays = new Set(picks.map((p) => new Date(p.at + 3 * 3_600_000).toISOString().slice(0, 10))).size
  return {
    accountId,
    samples: n,
    categories,
    hours: hours.map((h) => h / (n || 1)),
    featuredShare: n ? featured / n : 0,
    perDay: activeDays ? n / activeDays : 0,
    medianDelayMin: delays.length ? Math.round(delays[Math.floor(delays.length / 2)]) : null,
    formats,
    windowDays,
    updatedAt: now,
  }
}

// ── Aday puanlama ─────────────────────────────────────────────────────────

export interface AgentCandidate {
  facts: NewsFacts
  title: string
  hasImage: boolean
  sensitivityLevel: 0 | 1 | 2 | 3
}

export interface ScoredCandidate {
  newsId: string
  title: string
  score: number
  reasons: string[]
}

export const CANDIDATE_MAX_AGE_MS = 12 * 3_600_000

/**
 * Profil + aday → puan (0..1). Kararı açıklanabilir tutmak için her bileşenin
 * gerekçesi döner. Hassasiyet 3, görselsiz ve 12 saatten eski haber elenir.
 */
export function scoreCandidates(
  profile: PreferenceProfile,
  candidates: AgentCandidate[],
  now: number,
  alreadySharedIds: Set<string>
): ScoredCandidate[] {
  const maxCat = Math.max(0.0001, ...Object.values(profile.categories))
  const out: ScoredCandidate[] = []
  for (const c of candidates) {
    const f = c.facts
    if (alreadySharedIds.has(f.id)) continue
    if (f.status !== 'published' || f.publishedAt === null) continue
    if (now - f.publishedAt > CANDIDATE_MAX_AGE_MS || f.publishedAt > now) continue
    if (!c.hasImage) continue
    if (c.sensitivityLevel >= 3) continue
    const reasons: string[] = []
    const cat = profile.categories[f.categoryId] ?? 0
    const catScore = cat > 0 ? cat / maxCat : 0.05
    reasons.push(cat > 0 ? `kategori payı %${Math.round(cat * 100)}` : 'kategori daha önce seçilmemiş')
    const isFeat = f.featured || f.localFeatured
    const featScore = isFeat ? (profile.featuredShare >= 0.3 ? 1 : 0.6) : 0
    if (isFeat) reasons.push('öne çıkan')
    const ageH = (now - f.publishedAt) / 3_600_000
    const fresh = Math.exp(-ageH / 6)
    reasons.push(`${Math.max(1, Math.round(ageH * 60))} dk önce yayımlandı`)
    const sensPenalty = c.sensitivityLevel === 2 ? 0.15 : 0
    if (c.sensitivityLevel === 2) reasons.push('hassas haber (onay gerekir)')
    const score = Math.max(0, 0.55 * catScore + 0.2 * featScore + 0.25 * fresh - sensPenalty)
    out.push({ newsId: f.id, title: c.title, score: Math.round(score * 1000) / 1000, reasons })
  }
  return out.sort((a, b) => b.score - a.score)
}

// ── Yayın aralıkları ──────────────────────────────────────────────────────

export interface AgentSettings {
  accountId: string
  mode: AgentMode
  /** "HH:MM" Europe/Istanbul, artan sırada. */
  slots: string[]
  /** Bu zamana kadar «Yoktayım» (ms). Gölge modda yalnızca kayıt için. */
  awayUntil: number | null
  picksPerSlot: number
  updatedAt: number
  updatedBy: string | null
}

const SLOT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function validateSlots(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const slots = [...new Set(raw.map((s) => String(s).trim()))]
  if (slots.length > 12 || slots.some((s) => !SLOT_RE.test(s))) return null
  return slots.sort()
}

/** Istanbul gün + dakika (Türkiye yaz saati uygulamıyor: UTC+3 sabit). */
export function istanbulDayMinute(ms: number): { day: string; minute: number } {
  const t = new Date(ms + 3 * 3_600_000)
  return { day: t.toISOString().slice(0, 10), minute: t.getUTCHours() * 60 + t.getUTCMinutes() }
}

export function slotToMs(day: string, slot: string): number {
  const [h, m] = slot.split(':').map(Number)
  return Date.parse(`${day}T00:00:00.000Z`) - 3 * 3_600_000 + (h * 60 + m) * 60_000
}

/**
 * Şu ana kadar dolmuş ve henüz çalıştırılmamış en son aralık (en fazla 30 dk
 * gecikmeyle; kaçırılan eski aralıklar sonradan doldurulmaz).
 * Dönen pencere: [önceki aralık, bu aralık].
 */
export function dueSlot(
  settings: Pick<AgentSettings, 'slots'>,
  now: number,
  alreadyRan: (slotKey: string) => boolean,
  graceMs = 30 * 60_000
): { slotKey: string; windowStart: number; windowEnd: number } | null {
  const { day } = istanbulDayMinute(now)
  const slots = settings.slots
  for (let i = slots.length - 1; i >= 0; i--) {
    const end = slotToMs(day, slots[i])
    if (end > now) continue
    if (now - end > graceMs) return null
    const key = `${day} ${slots[i]}`
    if (alreadyRan(key)) return null
    const prev = i > 0 ? slotToMs(day, slots[i - 1]) : end - 6 * 3_600_000
    return { slotKey: key, windowStart: prev, windowEnd: end }
  }
  return null
}

export interface ShadowEvaluation {
  manualNewsIds: string[]
  /** Editör pencerede paylaşım yaptı mı? Yapmadıysa ajan B3'te devreye girerdi. */
  editorActed: boolean
  /** Ajanın ilk seçimi editörün seçimlerinden biri mi? */
  topPickMatched: boolean | null
  /** Ajanın seçimlerinden herhangi biri editörün seçimlerinden biri mi? */
  anyPickMatched: boolean | null
}

export function evaluateShadow(picks: string[], manualNewsIds: string[]): ShadowEvaluation {
  const manual = [...new Set(manualNewsIds)]
  if (manual.length === 0) return { manualNewsIds: [], editorActed: false, topPickMatched: null, anyPickMatched: null }
  const set = new Set(manual)
  return {
    manualNewsIds: manual,
    editorActed: true,
    topPickMatched: picks.length ? set.has(picks[0]) : false,
    anyPickMatched: picks.some((p) => set.has(p)),
  }
}

export function agreementRate(evals: Array<Pick<ShadowEvaluation, 'editorActed' | 'anyPickMatched'>>): {
  comparable: number
  matched: number
  rate: number | null
} {
  const comparable = evals.filter((e) => e.editorActed)
  const matched = comparable.filter((e) => e.anyPickMatched).length
  return { comparable: comparable.length, matched, rate: comparable.length ? matched / comparable.length : null }
}
