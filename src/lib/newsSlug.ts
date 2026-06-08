import { slugifyCity, transliterateTurkish } from '@/lib/location'
import { normalizeCitySlug } from '@/constants/cities'

/** URL-safe slug for news article titles (Turkish-aware). */
export function slugifyNewsTitle(title: string): string {
  const normalized = transliterateTurkish(title)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized.slice(0, 80) || 'haber'
}

/** Build a unique slug candidate; caller should de-dupe against Firestore. */
export function buildNewsSlug(title: string, suffix?: string): string {
  const base = slugifyNewsTitle(title)
  if (!suffix) return base
  const clean = suffix.replace(/[^a-z0-9-]/gi, '').slice(0, 12)
  return clean ? `${base}-${clean}` : base
}

/** Resolve city slug from free-text city name. */
export function resolveCitySlug(city: string | null | undefined): string {
  if (!city?.trim()) return ''
  return normalizeCitySlug(slugifyCity(city.trim()))
}
