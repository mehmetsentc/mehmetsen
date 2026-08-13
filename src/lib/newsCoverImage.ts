/**
 * Cover / thumbnail URL checks for newsroom ingest.
 * Pipeline rejects source items without a usable real image URL.
 */

/** Logged on queue skip + draft reject — visible in Cron/CMS. */
export const NO_COVER_IMAGE_REASON = 'görsel yok'

/** Brand / UI-only fallbacks that must not count as a real cover. */
const PLACEHOLDER_PATH_MARKERS = [
  '/brand/nahaber-logo',
  'nahaber-logo.png',
  'placeholder',
  '1x1',
  'pixel.gif',
  'spacer.',
  'blank.',
  'default-thumb',
  'no-image',
  'noimage',
]

/**
 * True when the URL is a usable http(s) cover image (not empty / placeholder-only).
 */
export function hasUsableCoverImage(url: string | null | undefined): boolean {
  const raw = typeof url === 'string' ? url.trim() : ''
  if (raw.length < 8) return false
  if (!/^https?:\/\//i.test(raw)) return false

  const lower = raw.toLowerCase()
  if (PLACEHOLDER_PATH_MARKERS.some((m) => lower.includes(m))) return false
  if (/[?&](w|width|h|height)=1(?:&|$)/i.test(lower) && /pixel|spacer|blank/i.test(lower)) {
    return false
  }

  return true
}

/** Resolve cover from common news document fields. */
export function resolveCoverImageUrl(data: {
  coverImageUrl?: unknown
  thumbnail?: unknown
  imageUrl?: unknown
  featuredImage?: unknown
  image?: unknown
}): string {
  for (const key of ['coverImageUrl', 'thumbnail', 'imageUrl', 'featuredImage', 'image'] as const) {
    const v = data[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}
