import { format, isSameDay } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { EventCategory } from '@/types/event'

const CATEGORY_LABELS: Record<EventCategory, string> = {
  concert: 'Konser',
  festival: 'Festival',
  party: 'Parti',
  exhibition: 'Sergi',
  theater: 'Tiyatro',
  other: 'Diğer',
}

const CATEGORY_STYLES: Record<EventCategory, string> = {
  concert: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  festival: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  party: 'bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  exhibition: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  theater: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

export const EVENT_CATEGORIES: Array<{ id: EventCategory; label: string }> = (
  Object.keys(CATEGORY_LABELS) as EventCategory[]
).map((id) => ({ id, label: CATEGORY_LABELS[id] }))

export function getEventCategoryLabel(category: EventCategory): string {
  return CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other
}

export function getEventCategoryStyle(category: EventCategory): string {
  return CATEGORY_STYLES[category] ?? CATEGORY_STYLES.other
}

/**
 * Formats an event's date/time in Turkish, e.g. "7 Haziran 2026, 20:00".
 * When an end time on the same day is provided it renders a range:
 * "7 Haziran 2026, 20:00 – 23:00".
 */
export function formatEventDateTime(startsAt: string, endsAt?: string): string {
  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) return ''

  const startLabel = format(start, 'd MMMM yyyy, HH:mm', { locale: tr })

  if (!endsAt) return startLabel

  const end = new Date(endsAt)
  if (Number.isNaN(end.getTime())) return startLabel

  if (isSameDay(start, end)) {
    return `${startLabel} – ${format(end, 'HH:mm', { locale: tr })}`
  }

  return `${startLabel} – ${format(end, 'd MMMM yyyy, HH:mm', { locale: tr })}`
}

/**
 * Hostnames whose event cover images we are willing to fetch/serve through the
 * `/api/events/image` proxy. This is the SSRF allowlist — the proxy refuses any
 * host not in this set. Keep it limited to the ticket-platform image CDNs we
 * actually scrape. Shared by the proxy route and the client helper below.
 */
export const EVENT_IMAGE_ALLOWED_HOSTS: readonly string[] = [
  'www.biletix.com',
  'biletix.com',
  'cdn.biletix.com',
  'cdnydm.biletix.com',
  'static.biletix.com',
  'cdn.bubilet.com.tr',
  'www.bubilet.com.tr',
  'bubilet.com.tr',
]

/** True when `hostname` is an allowed event-image host. */
export function isAllowedEventImageHost(hostname: string): boolean {
  return EVENT_IMAGE_ALLOWED_HOSTS.includes(hostname.toLowerCase())
}

/**
 * Resolves a (possibly protocol-relative) cover image URL and, when it points
 * at a known external ticket-platform host, rewrites it to our same-origin
 * proxy (`/api/events/image?url=...`). The proxy adds the right Referer/UA and
 * sane caching, so images load regardless of hotlink protection or next/image
 * domain config. Returns `null` for empty/invalid input, and passes through
 * already-local (relative or same-origin) URLs unchanged.
 */
export function resolveEventImageUrl(url: string | null | undefined): string | null {
  const raw = url?.trim()
  if (!raw) return null

  // Local/relative URLs (including our own proxy) are used as-is.
  if (raw.startsWith('/')) return raw

  // Normalize protocol-relative URLs ("//host/path") to https.
  const absolute = raw.startsWith('//') ? `https:${raw}` : raw

  let parsed: URL
  try {
    parsed = new URL(absolute)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  if (isAllowedEventImageHost(parsed.hostname)) {
    return `/api/events/image?url=${encodeURIComponent(parsed.toString())}`
  }

  // Unknown host: return the absolute URL and let the <img> try directly.
  return absolute
}

/** Short day badge, e.g. "7 Haz" used on compact cards. */
export function formatEventDayBadge(startsAt: string): { day: string; month: string } {
  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) return { day: '', month: '' }
  return {
    day: format(start, 'd', { locale: tr }),
    month: format(start, 'MMM', { locale: tr }),
  }
}
