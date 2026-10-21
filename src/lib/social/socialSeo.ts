/**
 * SOCIAL-SEO-1 — location, longer search-friendly description and 5 discovery hashtags
 * for every social share (posts, reels, YouTube Shorts). Pure helpers, no I/O; built
 * from the story itself (no extra AI call).
 */
import { clampCompleteSentences } from './feedCaption'

export type SocialLocation = {
  city: string | null
  district: string | null
  citySlug: string | null
  districtSlug: string | null
  /** «Gelibolu, Çanakkale» / «Çanakkale» / null */
  label: string | null
  lat: number | null
  lng: number | null
}

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : null)
const trLower = (s: string) => s.toLocaleLowerCase('tr-TR')
const titleCase = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR'))
    .join(' ')

const NON_PLACES = new Set(['', 'türkiye', 'turkiye', 'yurt dışı', 'dünya', 'merkez', 'genel'])

/** Where the story happened, from the stored geo fields (no guessing). */
export function socialLocationFromDoc(d: Record<string, unknown>): SocialLocation {
  const loc = (d.location && typeof d.location === 'object' ? d.location : {}) as Record<string, unknown>
  const rawCity = str(d.city) || str(d.cityName) || str(loc.city)
  const rawDistrict = str(d.district) || str(loc.district)
  const city = rawCity && !NON_PLACES.has(trLower(rawCity)) ? titleCase(rawCity) : null
  const district =
    rawDistrict && !NON_PLACES.has(trLower(rawDistrict)) && trLower(rawDistrict) !== trLower(rawCity)
      ? titleCase(rawDistrict)
      : null
  const label = city ? (district ? `${district}, ${city}` : city) : null
  return {
    city,
    district,
    citySlug: str(d.citySlug) || null,
    districtSlug: str(d.districtSlug) || null,
    label,
    lat: num(loc.lat),
    lng: num(loc.lng),
  }
}

/** «trafik kazası» → «#TrafikKazası»; null when it would be junk. */
export function toHashtag(raw: string): string | null {
  const words = raw
    .replace(/^#/, '')
    .replace(/['’`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  if (!words.length) return null
  const tag = words.map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1)).join('')
  if (tag.length < 3 || tag.length > 30 || /^\d+$/.test(tag)) return null
  return `#${tag}`
}

const GENERIC_TAGS = new Set(
  ['haber', 'haberler', 'son dakika', 'sondakika', 'gündem', 'güncel', 'türkiye', 'nahaber', 'yerel', 'son haberler', 'manşet', 'video', 'shorts']
    .map(trLower),
)

/** Category label for a hashtag: «Yerel Asayiş» → «Asayiş». */
function categoryWord(label: string): string {
  return label.replace(/^(yerel|ulusal|dünya)\s+/i, '').trim()
}

/**
 * Exactly `n` (5) discovery hashtags, most specific first:
 *   city, district, category, story topics (stored tags / SEO keywords), then «#{İl}Haber»,
 *   «#SonDakika» for breaking stories and «#Gündem» as last resort. No brand padding.
 */
export function buildSeoHashtags(
  input: {
    location: Pick<SocialLocation, 'city' | 'district'>
    categoryLabel?: string | null
    tags?: unknown
    keywords?: unknown
    breaking?: boolean
  },
  n = 5,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | null | undefined) => {
    if (!raw || out.length >= n) return
    if (GENERIC_TAGS.has(trLower(raw.replace(/^#/, '')))) return
    const t = toHashtag(raw)
    if (!t) return
    const k = trLower(t)
    if (seen.has(k)) return
    seen.add(k)
    out.push(t)
  }
  push(input.location.city)
  push(input.location.district)
  if (input.categoryLabel) push(categoryWord(input.categoryLabel))
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  for (const t of [...list(input.tags), ...list(input.keywords)]) {
    if (t.split(/\s+/).length > 3) continue
    push(t)
  }
  if (input.location.city) push(`${input.location.city} Haber`)
  if (input.breaking) {
    if (out.length < n) {
      seen.add('#sondakika')
      out.push('#SonDakika')
    }
  }
  if (out.length < n && !seen.has('#gündem')) out.push('#Gündem')
  if (out.length < n && !seen.has('#türkiye')) out.push('#Türkiye')
  return out.slice(0, n)
}

function sentences(text: string): string[] {
  return (
    text
      .replace(/\s+/g, ' ')
      .match(/[^.!?…]+[.!?…]+["'»”’)]*/g)
      ?.map((s) => s.trim())
      .filter((s) => s.length > 20) ?? []
  )
}

const near = (a: string, b: string) => {
  const x = trLower(a).replace(/[^\p{L}\p{N} ]/gu, '')
  const y = trLower(b).replace(/[^\p{L}\p{N} ]/gu, '')
  return !!x && !!y && (x.includes(y.slice(0, 40)) || y.includes(x.slice(0, 40)))
}

/**
 * Longer, search-friendly description body (no URL, no hashtags — publishers add them):
 *   paragraph 1: the lead (spot), paragraph 2: two–three more facts from the story body
 *   that the lead does not already say, last line: «📍 Gelibolu, Çanakkale».
 * Only whole sentences; ~600–1,000 characters.
 */
export function buildSeoDescription(input: {
  title: string
  spot?: string | null
  body?: string | null
  location?: Pick<SocialLocation, 'label'> | null
  maxChars?: number
}): string {
  const max = input.maxChars ?? 1000
  const lead = clampCompleteSentences(str(input.spot), 420)
  const used = [input.title, lead]
  const extra: string[] = []
  let budget = Math.max(0, max - lead.length - 60)
  for (const s of sentences(str(input.body))) {
    if (extra.length >= 3 || s.length > budget) break
    if (used.some((u) => near(u, s)) || extra.some((e) => near(e, s))) continue
    extra.push(s)
    budget -= s.length + 1
  }
  const parts = [lead, extra.join(' ')].filter(Boolean)
  const place = input.location?.label ? `📍 ${input.location.label}` : ''
  return [...parts, place].filter(Boolean).join('\n\n')
}

/** Adds «📍 …» to an existing caption body when it has no location line yet. */
export function withLocationLine(body: string, location: Pick<SocialLocation, 'label'> | null | undefined): string {
  const b = body.trim()
  if (!location?.label || b.includes('📍')) return b
  return b ? `${b}\n\n📍 ${location.label}` : `📍 ${location.label}`
}
