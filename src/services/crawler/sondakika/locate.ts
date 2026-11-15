import { TURKISH_PROVINCES } from '@/constants/cities'
import { PROVINCE_DISTRICTS } from '@/constants/turkishDistricts'

/**
 * SONDAKIKA-81: haberin il/ilçesini METİNDEN bulur.
 *
 * sondakika.com il sayfaları komşu illerin ve ulusal haberleri de listeliyor
 * (Adana sayfasında Osmaniye kazası, Ankara sayfasında Alanya haberi). Bu yüzden
 * kaynağın ili (source.city) tek başına güvenilir değil.
 *
 * Sinyaller: başlık > özet > metin, ilçe adı → il. Birden çok ilde aynı adla bulunan
 * ilçeler (Kemer, Pazar...) ve sıradan kelime/kişi adıyla çakışanlar (Ulus, Susuz,
 * Fatih, Kartal...) yalnızca ilin kendisi de metinde geçiyorsa kullanılır.
 * Doğrulama (15.11.2026, 150 gerçek haber): il bulunamayan 0, yanlış il 0.
 */

export interface LocateInput {
  title: string | null | undefined
  description?: string | null
  body?: string | null
}

export interface LocateResult {
  provinceSlug: string | null
  provinceName: string | null
  districtName: string | null
  confidence: 'high' | 'medium' | 'low'
  /** Metinde güçlü geçen 4+ il → ulusal haber (meteoroloji uyarısı vb.) */
  likelyNational: boolean
}

const ALIASES: Record<string, string[]> = {
  afyonkarahisar: ['Afyon'],
  kahramanmaras: ['Maraş', 'K.Maraş'],
  sanliurfa: ['Urfa'],
  gaziantep: ['Antep'],
  mersin: ['İçel'],
}

/** Sıradan kelime, kişi/kulüp/bölge/meydan adıyla çakışan ilçeler (gerçek veride hata üretenler dahil). */
const COMMON_WORD_DISTRICTS = new Set([
  'ulus', 'susuz', 'genc', 'sur', 'bor', 'hamur', 'bala', 'agin', 'cay', 'mut', 'cinar', 'guney',
  'akdeniz', 'selcuklu', 'yildirim', 'seyhan', 'cukurova', 'kiraz', 'han', 'adalar', 'kartal',
  'fatih', 'tuzla', 'basaksehir', 'kas', 'merkezefendi', 'altindag', 'karsiyaka', 'ceyhan',
  'saraykoy', 'turgutlu', 'polatli', 'kale', 'pazar', 'saray', 'merkez',
])

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Özel ad: büyük harfle, ardından kesme işareti / boşluk / noktalama / metin sonu. */
function nameRe(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])${escapeRe(name)}(?=['’\\s.,:;!?)\\-]|$)`, 'gu')
}

const PROVINCE_PATTERNS = TURKISH_PROVINCES.map((p) => ({
  slug: p.slug,
  name: p.name,
  res: [p.name, ...(ALIASES[p.slug] ?? [])].map(nameRe),
}))
const PROVINCE_NAME_BY_SLUG = new Map(TURKISH_PROVINCES.map((p) => [p.slug, p.name]))
const PROVINCE_SLUGS = new Set(TURKISH_PROVINCES.map((p) => p.slug))

interface DistrictPattern {
  name: string
  slug: string
  provinceSlug: string
  re: RegExp
  ambiguous: boolean
  commonWord: boolean
}

const DISTRICT_PATTERNS: DistrictPattern[] = (() => {
  const all = Object.entries(PROVINCE_DISTRICTS).flatMap(([provinceSlug, list]) =>
    list.map((d) => ({ ...d, provinceSlug }))
  )
  const counts = new Map<string, number>()
  for (const d of all) counts.set(d.slug, (counts.get(d.slug) ?? 0) + 1)
  return all
    .filter((d) => d.name !== 'Merkez' && !PROVINCE_SLUGS.has(d.slug))
    .map((d) => ({
      name: d.name,
      slug: d.slug,
      provinceSlug: d.provinceSlug,
      re: nameRe(d.name),
      ambiguous: (counts.get(d.slug) ?? 0) > 1,
      commonWord: COMMON_WORD_DISTRICTS.has(d.slug),
    }))
})()

/**
 * "{İl} Üniversitesi", "{İl} Mustafa Kemal Üniversitesi" gibi kurum adları konum değildir
 * (gerçek veri: "Sakarya Üniversitesi COP31'de..." — etkinlik Antalya'da).
 */
const INSTITUTION_AFTER = /^(?:\s+\p{Lu}[\p{L}]*){0,3}\s+(?:Teknik\s+)?Üniversitesi/u

function matchIndexes(re: RegExp, s: string): number[] {
  const out: number[] = []
  const g = new RegExp(re.source, 'gu')
  let m: RegExpExecArray | null
  while ((m = g.exec(s))) {
    if (!INSTITUTION_AFTER.test(s.slice(m.index + m[0].length))) out.push(m.index)
    if (m[0].length === 0) g.lastIndex += 1
  }
  return out
}

function count(re: RegExp, s: string): number {
  return matchIndexes(re, s).length
}

function firstIndex(re: RegExp, s: string): number {
  return matchIndexes(re, s)[0] ?? -1
}

export function locateSondakikaArticle(input: LocateInput): LocateResult {
  const head = input.title ?? ''
  const desc = input.description ?? ''
  const body = input.body ?? ''
  const score = new Map<string, number>()
  const firstInHead = new Map<string, number>()
  const add = (slug: string, n: number) => {
    if (n) score.set(slug, (score.get(slug) ?? 0) + n)
  }
  const markHead = (slug: string, idx: number) => {
    const cur = firstInHead.get(slug)
    if (idx >= 0 && (cur === undefined || idx < cur)) firstInHead.set(slug, idx)
  }

  for (const p of PROVINCE_PATTERNS) {
    for (const re of p.res) {
      if (count(re, head)) {
        add(p.slug, 6)
        markHead(p.slug, firstIndex(re, head))
      }
      if (count(re, desc)) add(p.slug, 3)
      add(p.slug, Math.min(count(re, body), 3))
    }
  }

  const districtHits: Array<{ d: DistrictPattern; w: number; headIdx: number }> = []
  for (const d of DISTRICT_PATTERNS) {
    const h = count(d.re, head)
    const w = h * 5 + (count(d.re, desc) ? 2 : 0) + Math.min(count(d.re, body), 2)
    if (!w) continue
    const provinceMentioned = Boolean(score.get(d.provinceSlug))
    if ((d.ambiguous || d.commonWord) && !provinceMentioned) continue
    districtHits.push({ d, w, headIdx: h ? firstIndex(d.re, head) : Number.POSITIVE_INFINITY })
  }
  for (const hit of districtHits) {
    add(hit.d.provinceSlug, hit.w)
    if (Number.isFinite(hit.headIdx)) markHead(hit.d.provinceSlug, hit.headIdx)
  }

  const ranked = [...score.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return (firstInHead.get(a[0]) ?? Infinity) - (firstInHead.get(b[0]) ?? Infinity)
  })

  // Başlıkta ilk geçen il çoğu zaman olayın yeridir ("Osmaniye'de kaza ... Adana'ya sevk").
  let provinceSlug: string | null = null
  if (firstInHead.size) {
    provinceSlug = [...firstInHead.entries()].sort((a, b) => a[1] - b[1])[0][0]
    const top = ranked[0]
    if (top && top[0] !== provinceSlug && top[1] >= 2 * (score.get(provinceSlug) ?? 0)) provinceSlug = top[0]
  } else if (ranked.length) {
    provinceSlug = ranked[0][0]
  }

  let confidence: LocateResult['confidence'] = 'low'
  if (provinceSlug) {
    const s = score.get(provinceSlug) ?? 0
    confidence = firstInHead.has(provinceSlug) || s >= 6 ? 'high' : s >= 3 ? 'medium' : 'low'
  }
  const strong = ranked.filter(([, s]) => s >= 3).length
  const likelyNational = strong >= 4

  const districtName =
    districtHits
      .filter((h) => h.d.provinceSlug === provinceSlug)
      .sort((a, b) => b.w - a.w || a.headIdx - b.headIdx)[0]?.d.name ?? null

  return {
    provinceSlug,
    provinceName: provinceSlug ? PROVINCE_NAME_BY_SLUG.get(provinceSlug) ?? null : null,
    districtName,
    confidence,
    likelyNational,
  }
}
