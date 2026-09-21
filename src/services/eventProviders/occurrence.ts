import { isSameIstanbulCalendarDay, istanbulCalendarParts } from '@/lib/annualEventDates'
import { toIso } from './shared'

const TR_MONTHS: Record<string, number> = {
  ocak: 1,
  subat: 2,
  şubat: 2,
  mart: 3,
  nisan: 4,
  mayis: 5,
  mayıs: 5,
  haziran: 6,
  temmuz: 7,
  agustos: 8,
  ağustos: 8,
  eylul: 9,
  eylül: 9,
  ekim: 10,
  kasim: 11,
  kasım: 11,
  aralik: 12,
  aralık: 12,
}

export function isRangeContainer(startsAt: string | null | undefined, endsAt: string | null | undefined): boolean {
  if (!startsAt?.trim()) return false
  if (!endsAt?.trim()) return false
  if (!toIso(startsAt) || !toIso(endsAt)) return false
  return !isSameIstanbulCalendarDay(toIso(startsAt)!, toIso(endsAt)!)
}

export function istanbulLocalDateKey(iso: string): string {
  const { year, month, day } = istanbulCalendarParts(iso)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function istanbulLocalTimeKey(iso: string): string {
  const { hour, minute } = istanbulCalendarParts(iso)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function parseTurkishDateTime(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const text = raw
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim()

  const monthNames = Object.keys(TR_MONTHS).sort((a, b) => b.length - a.length).join('|')
  const patterns = [
    new RegExp(
      `(\\d{1,2})\\s+(${monthNames})\\s+(\\d{4})(?:\\s+(\\d{1,2})[:.](\\d{2}))?`,
      'i'
    ),
    new RegExp(
      `(${monthNames})\\s+(\\d{1,2}),?\\s+(\\d{4})(?:\\s+(\\d{1,2})[:.](\\d{2}))?`,
      'i'
    ),
  ]

  for (const re of patterns) {
    const match = text.match(re)
    if (!match) continue
    const monthFirst = Number.isNaN(Number(match[1]))
    const day = Number(monthFirst ? match[2] : match[1])
    const monthName = monthFirst ? match[1] : match[2]
    const year = Number(match[3])
    const hour = match[4] != null ? Number(match[4]) : null
    const minute = match[5] != null ? Number(match[5]) : 0
    const month = TR_MONTHS[monthName]
    if (!month || !day || !year) continue
    if (hour == null) return null
    return istanbulWallToIso(year, month, day, hour, minute)
  }
  return null
}

function istanbulWallToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string {
  const guess = Date.parse(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+03:00`
  )
  if (!Number.isNaN(guess)) return new Date(guess).toISOString()
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

export function looksLikeChallengePage(html: string, status: number): boolean {
  if (status === 401 && /"response"\s*:\s*"identify"/i.test(html)) return true
  if (/<title[^>]*>\s*just a moment/i.test(html)) return true
  const challengeBody =
    /attention required|cf-challenge-running|cf-browser-verification|cdn-cgi\/challenge-platform/i.test(
      html
    )
  if (status === 403 || status === 503) return challengeBody || /challenge-platform/i.test(html)
  // A 200 page may load Cloudflare analytics; that is not a block.
  if (status === 200) return false
  return false
}

export function looksLikeRateLimit(status: number): boolean {
  return status === 429
}
