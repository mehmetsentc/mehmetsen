import { TURKISH_PROVINCES } from '@/constants/cities'
import { slugifyCity } from '@/lib/location'

/**
 * Kaynakların il adlarını (Afyon, K.Maraş, İstanbul Avrupa, «Istanbul», İçel…) bizim 81 il
 * slug'ımıza çevirir. KKTC (Kıbrıs, Lefkoşa, Girne, Gazimağusa…) ayrı bölge: `kktc`.
 * İl değilse (yurt dışı, ilçe adı) null döner → kayıt alınmaz.
 */
export const KKTC_SLUG = 'kktc'
const KKTC_NAMES = new Set(['kktc', 'kibris', 'kuzey-kibris', 'kuzey-kibris-turk-cumhuriyeti', 'lefkosa', 'girne', 'gazimagusa', 'magusa', 'famagusta', 'kyrenia', 'nicosia', 'iskele', 'guzelyurt', 'lefke'])
const PROVINCE_SLUGS = new Set(TURKISH_PROVINCES.map((p) => p.slug))
const ALIASES: Record<string, string> = {
  afyon: 'afyonkarahisar',
  'k-maras': 'kahramanmaras',
  maras: 'kahramanmaras',
  'k-maraş': 'kahramanmaras',
  icel: 'mersin',
  'istanbul-avrupa': 'istanbul',
  'istanbul-anadolu': 'istanbul',
  'istanbul-tumu': 'istanbul',
  'istanbul-avrupa-yakasi': 'istanbul',
  'istanbul-anadolu-yakasi': 'istanbul',
  antep: 'gaziantep',
  urfa: 'sanliurfa',
  izmit: 'kocaeli',
  adapazari: 'sakarya',
  antakya: 'hatay',
}

export function provinceSlug(name: string | null | undefined): string | null {
  if (!name) return null
  const base = slugifyCity(name.replace(/\(.*?\)/g, ' '))
  if (!base) return null
  if (KKTC_NAMES.has(base)) return KKTC_SLUG
  const s = ALIASES[base] ?? base
  return PROVINCE_SLUGS.has(s) ? s : null
}

/** Adres metninde geçen il adını bulur («… Beyoğlu/İstanbul»). */
export function provinceFromText(text: string | null | undefined): string | null {
  if (!text) return null
  const parts = text.split(/[\s,/·-]+/).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const s = provinceSlug(parts[i])
    if (s) return s
  }
  return null
}

export function provinceName(slug: string): string {
  if (slug === KKTC_SLUG) return 'KKTC'
  return TURKISH_PROVINCES.find((p) => p.slug === slug)?.name ?? slug
}
