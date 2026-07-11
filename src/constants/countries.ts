export interface WorldCountry {
  slug: string
  name: string
}

/** Dünya haberleri için ülke listesi (Türkçe adlar). */
export const WORLD_COUNTRIES: WorldCountry[] = [
  { slug: 'afganistan', name: 'Afganistan' },
  { slug: 'almanya', name: 'Almanya' },
  { slug: 'amerika-birlesik-devletleri', name: 'ABD' },
  { slug: 'arjantin', name: 'Arjantin' },
  { slug: 'arnavutluk', name: 'Arnavutluk' },
  { slug: 'avustralya', name: 'Avustralya' },
  { slug: 'avusturya', name: 'Avusturya' },
  { slug: 'azerbaycan', name: 'Azerbaycan' },
  { slug: 'bahreyn', name: 'Bahreyn' },
  { slug: 'banglades', name: 'Bangladeş' },
  { slug: 'belarus', name: 'Belarus' },
  { slug: 'belcika', name: 'Belçika' },
  { slug: 'birlesik-arap-emirlikleri', name: 'Birleşik Arap Emirlikleri' },
  { slug: 'birlesik-krallik', name: 'Birleşik Krallık' },
  { slug: 'bolivya', name: 'Bolivya' },
  { slug: 'bosna-hersek', name: 'Bosna-Hersek' },
  { slug: 'brezilya', name: 'Brezilya' },
  { slug: 'bulgaristan', name: 'Bulgaristan' },
  { slug: 'cezayir', name: 'Cezayir' },
  { slug: 'cin', name: 'Çin' },
  { slug: 'danimarka', name: 'Danimarka' },
  { slug: 'endonezya', name: 'Endonezya' },
  { slug: 'ermenistan', name: 'Ermenistan' },
  { slug: 'fas', name: 'Fas' },
  { slug: 'filipinler', name: 'Filipinler' },
  { slug: 'filistin', name: 'Filistin' },
  { slug: 'finlandiya', name: 'Finlandiya' },
  { slug: 'fransa', name: 'Fransa' },
  { slug: 'gurcistan', name: 'Gürcistan' },
  { slug: 'guney-afrika', name: 'Güney Afrika' },
  { slug: 'guney-kore', name: 'Güney Kore' },
  { slug: 'guney-sudan', name: 'Güney Sudan' },
  { slug: 'hindistan', name: 'Hindistan' },
  { slug: 'hollanda', name: 'Hollanda' },
  { slug: 'irak', name: 'Irak' },
  { slug: 'iran', name: 'İran' },
  { slug: 'irlanda', name: 'İrlanda' },
  { slug: 'ispanya', name: 'İspanya' },
  { slug: 'israil', name: 'İsrail' },
  { slug: 'isvec', name: 'İsveç' },
  { slug: 'isvicre', name: 'İsviçre' },
  { slug: 'italya', name: 'İtalya' },
  { slug: 'japonya', name: 'Japonya' },
  { slug: 'kambocya', name: 'Kamboçya' },
  { slug: 'kanada', name: 'Kanada' },
  { slug: 'katar', name: 'Katar' },
  { slug: 'kazakistan', name: 'Kazakistan' },
  { slug: 'kenya', name: 'Kenya' },
  { slug: 'kirgizistan', name: 'Kırgızistan' },
  { slug: 'kolombiya', name: 'Kolombiya' },
  { slug: 'kosova', name: 'Kosova' },
  { slug: 'kuveyt', name: 'Kuveyt' },
  { slug: 'kuzey-kore', name: 'Kuzey Kore' },
  { slug: 'kuzey-makedonya', name: 'Kuzey Makedonya' },
  { slug: 'libya', name: 'Libya' },
  { slug: 'lubnan', name: 'Lübnan' },
  { slug: 'macaristan', name: 'Macaristan' },
  { slug: 'makedonya', name: 'Makedonya' },
  { slug: 'malezya', name: 'Malezya' },
  { slug: 'meksika', name: 'Meksika' },
  { slug: 'misir', name: 'Mısır' },
  { slug: 'mogolistan', name: 'Moğolistan' },
  { slug: 'moldova', name: 'Moldova' },
  { slug: 'nijerya', name: 'Nijerya' },
  { slug: 'norvec', name: 'Norveç' },
  { slug: 'ozbekistan', name: 'Özbekistan' },
  { slug: 'pakistan', name: 'Pakistan' },
  { slug: 'polonya', name: 'Polonya' },
  { slug: 'portekiz', name: 'Portekiz' },
  { slug: 'romanya', name: 'Romanya' },
  { slug: 'rusya', name: 'Rusya' },
  { slug: 'sirbistan', name: 'Sırbistan' },
  { slug: 'singapur', name: 'Singapur' },
  { slug: 'somali', name: 'Somali' },
  { slug: 'sri-lanka', name: 'Sri Lanka' },
  { slug: 'sudan', name: 'Sudan' },
  { slug: 'suriye', name: 'Suriye' },
  { slug: 'suudi-arabistan', name: 'Suudi Arabistan' },
  { slug: 'tayland', name: 'Tayland' },
  { slug: 'tayvan', name: 'Tayvan' },
  { slug: 'tunus', name: 'Tunus' },
  { slug: 'turkiye', name: 'Türkiye' },
  { slug: 'turkmenistan', name: 'Türkmenistan' },
  { slug: 'ukrayna', name: 'Ukrayna' },
  { slug: 'umman', name: 'Umman' },
  { slug: 'urdun', name: 'Ürdün' },
  { slug: 'venezuela', name: 'Venezuela' },
  { slug: 'vietnam', name: 'Vietnam' },
  { slug: 'yemen', name: 'Yemen' },
  { slug: 'yeni-zelanda', name: 'Yeni Zelanda' },
  { slug: 'yunanistan', name: 'Yunanistan' },
]

const bySlug = new Map(WORLD_COUNTRIES.map((c) => [c.slug, c]))
const byName = new Map(WORLD_COUNTRIES.map((c) => [c.name.toLowerCase(), c]))

export function findCountryBySlug(slug: string): WorldCountry | undefined {
  return bySlug.get(slug.trim().toLowerCase())
}

export function findCountryByName(name: string): WorldCountry | undefined {
  const key = name.trim().toLowerCase()
  if (byName.has(key)) return byName.get(key)
  if (key === 'amerika' || key === 'usa' || key === 'united states') {
    return byName.get('abd')
  }
  if (key === 'ingiltere' || key === 'united kingdom' || key === 'uk') {
    return byName.get('birleşik krallık')
  }
  return undefined
}

export function resolveCountrySlug(raw?: string | null, countryName?: string | null): string {
  if (raw?.trim()) {
    const fromSlug = findCountryBySlug(raw)
    if (fromSlug) return fromSlug.slug
  }
  if (countryName?.trim()) {
    const fromName = findCountryByName(countryName)
    if (fromName) return fromName.slug
  }
  return ''
}
