export type EventImageQuality = 'specific' | 'generic' | 'unknown' | 'none'

const GENERIC_TICKETMASTER = /ticketm\.net\/dam\/c\//i
const BILETIX_POSTER = /biletix\.com\/.*eventimages/i
const BUBILET_POSTER = /bubilet\.com\.tr\/(?:cdn-cgi\/image\/[^/]+\/)?files\/Etkinlik\//i
const BILETIMGO_POSTER = /biletimgo\.com\/images\/(?!logo|favicon)/i
const LOGO_OR_FAVICON = /(favicon|apple-touch-icon|\/logo\b|logo\.(png|svg|jpg|webp))/i

export function classifyEventImage(url: string | null | undefined): EventImageQuality {
  const value = url?.trim()
  if (!value) return 'none'
  if (LOGO_OR_FAVICON.test(value)) return 'generic'
  if (GENERIC_TICKETMASTER.test(value)) return 'generic'
  if (BILETIX_POSTER.test(value) || BUBILET_POSTER.test(value) || BILETIMGO_POSTER.test(value)) {
    return 'specific'
  }
  return 'unknown'
}

export function isEventSpecificPoster(url: string | null | undefined): boolean {
  return classifyEventImage(url) === 'specific'
}

export function isGenericCategoryImage(url: string | null | undefined): boolean {
  return classifyEventImage(url) === 'generic'
}

export function preferEventPoster(
  primary: string | null | undefined,
  fallback: string | null | undefined
): string | undefined {
  const a = primary?.trim() || ''
  const b = fallback?.trim() || ''
  if (!a) return b || undefined
  if (!b) return a || undefined
  const qa = classifyEventImage(a)
  const qb = classifyEventImage(b)
  const rank = (q: EventImageQuality) =>
    q === 'specific' ? 3 : q === 'unknown' ? 2 : q === 'generic' ? 1 : 0
  return rank(qb) > rank(qa) ? b : a
}
