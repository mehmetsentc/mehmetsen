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

/**
 * Temporary CMS draft placeholders — must never appear in public `/haber/{slug}`
 * or social “Haberi Oku” links (e.g. `taslak-lt4fhphn`, `ai-taslak-…`, `…-taslak`).
 */
export function isPlaceholderDraftSlug(slug: string | null | undefined): boolean {
  const s = (slug ?? '').trim().toLowerCase()
  if (!s) return true
  if (s === 'taslak' || s === 'ai-taslak') return true
  if (s.startsWith('taslak-') || s.startsWith('ai-taslak-')) return true
  if (s.endsWith('-taslak') || s.includes('-taslak-')) return true
  return false
}

/** True when a full URL points at a draft placeholder path. */
export function urlContainsDraftSlug(url: string | null | undefined): boolean {
  const u = (url ?? '').trim().toLowerCase()
  if (!u) return false
  try {
    const path = new URL(u).pathname.toLowerCase()
    const m = path.match(/\/haber\/([^/?#]+)/)
    if (m?.[1] && isPlaceholderDraftSlug(decodeURIComponent(m[1]))) return true
  } catch {
    /* relative / malformed */
    if (/\/haber\/(?:ai-)?taslak(?:-|\/|$)/i.test(u)) return true
  }
  return false
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
