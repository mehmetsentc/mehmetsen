import { format, isSameDay } from 'date-fns'
import { tr } from 'date-fns/locale'
import {
  getIstanbulTodayStartIso,
  isSameOrAfterIstanbulCalendarDay,
  resolveEventSchedule,
} from '@/lib/annualEventDates'
import type { EventCategory } from '@/types/event'

const CATEGORY_LABELS: Record<EventCategory, string> = {
  concert: 'Konser',
  festival: 'Festival',
  party: 'Parti',
  exhibition: 'Sergi',
  theater: 'Tiyatro',
  cinema: 'Sinema',
  other: 'Diğer',
}

const CATEGORY_STYLES: Record<EventCategory, string> = {
  concert: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  festival: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  party: 'bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  exhibition: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  theater: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  cinema: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
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

type EventDateFields = {
  startsAt: string
  endsAt?: string
  dateLabel?: string
  recurrence?: 'annual'
}

/**
 * Formats an event's date/time in Turkish, e.g. "7 Haziran 2026, 20:00".
 * When an end time on the same day is provided it renders a range:
 * "7 Haziran 2026, 20:00 – 23:00".
 * Prefers `dateLabel` for recurring / approximate municipal events.
 */
export function formatEventDateTime(
  startsAt: string,
  endsAt?: string,
  dateLabel?: string
): string {
  if (dateLabel?.trim()) return dateLabel.trim()

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
  'www.paribucineverse.com',
  'paribucineverse.com',
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

export function formatEventDisplayDate(event: EventDateFields): string {
  return formatEventDateTime(event.startsAt, event.endsAt, event.dateLabel)
}

/** When an event is no longer active — `endsAt` when set, otherwise `startsAt`. */
export function getEventActiveUntilIso(event: EventDateFields, nowIso?: string): string {
  const resolved = resolveEventSchedule(event, nowIso)
  return resolved.endsAt?.trim() || resolved.startsAt
}

/**
 * True when the event is today/future, or a multi-day event still running
 * (resolved end calendar day is today or later) — Istanbul calendar.
 */
export function isEventUpcoming(
  event: EventDateFields,
  nowIso: string = new Date().toISOString()
): boolean {
  const resolved = resolveEventSchedule(event, nowIso)

  if (isSameOrAfterIstanbulCalendarDay(resolved.startsAt, nowIso)) {
    return true
  }

  const endIso = resolved.endsAt?.trim()
  if (!endIso) return false

  return (
    isSameOrAfterIstanbulCalendarDay(nowIso, resolved.startsAt) &&
    isSameOrAfterIstanbulCalendarDay(endIso, nowIso)
  )
}

/** @deprecated Upcoming queries use start-of-today (Istanbul), not a lookback window. */
export const UPCOMING_EVENT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000

/** How far back the "Geçmiş" tab lists ended events. */
export const PAST_EVENT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000

export function getUpcomingStartsAtLowerBound(
  nowIso: string = new Date().toISOString()
): string {
  return getIstanbulTodayStartIso(nowIso)
}

/** True when event is free to attend (explicit flag or no ticket URL). */
export function isEventFree(event: { isFree?: boolean; ticketUrl?: string }): boolean {
  if (event.isFree === true) return true
  if (event.isFree === false) return false
  return !event.ticketUrl?.trim()
}

const EVENT_TYPE_TAG_LABELS: Record<string, string> = {
  festival: 'Festival',
  bienal: 'Bienal',
  'yarışma': 'Yarışma',
  yarismasi: 'Yarışma',
  konser: 'Konser',
  'panayır': 'Panayır',
  panayiri: 'Panayır',
  'şenlik': 'Şenlik',
  senlik: 'Şenlik',
  spor: 'Spor',
  fuar: 'Fuar',
  film: 'Film',
  sinema: 'Sinema',
  cinema: 'Sinema',
  'kültür': 'Kültür',
  kultur: 'Kültür',
}

const EVENT_TYPE_TAG_STYLES: Record<string, string> = {
  festival: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  bienal: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  'yarışma': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  yarismasi: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  konser: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
  'panayır': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  panayiri: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  'şenlik': 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200',
  senlik: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200',
  spor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200',
  fuar: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  film: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200',
  sinema: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  cinema: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  'kültür': 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  kultur: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
}

/** Display tags excluding Ücretsiz / halka açık (shown as separate badges). */
export function getEventTypeTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return []
  const skip = new Set(['ücretsiz', 'ucretsiz', 'halka açık', 'halka acik'])
  return tags.filter((tag) => !skip.has(tag.trim().toLocaleLowerCase('tr-TR')))
}

export function getEventTypeTagLabel(tag: string): string {
  const key = tag.trim().toLocaleLowerCase('tr-TR')
  return EVENT_TYPE_TAG_LABELS[key] ?? tag
}

export function getEventTypeTagStyle(tag: string): string {
  const key = tag.trim().toLocaleLowerCase('tr-TR')
  return EVENT_TYPE_TAG_STYLES[key] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
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
