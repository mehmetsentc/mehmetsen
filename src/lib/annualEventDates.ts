import type { NaEvent } from '@/types/event'

const ISTANBUL_TZ = 'Europe/Istanbul'

type ScheduleInput = Pick<NaEvent, 'startsAt' | 'endsAt' | 'recurrence'>

function istanbulParts(iso: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISTANBUL_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  }
}

/** UTC ISO for an Istanbul-local wall-clock (TR is UTC+3, no DST). */
function istanbulLocalToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): string {
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second)).toISOString()
}

function buildOccurrence(
  templateStartIso: string,
  templateEndIso: string | undefined,
  year: number
): { startsAt: string; endsAt?: string } {
  const s = istanbulParts(templateStartIso)
  const startsAt = istanbulLocalToUtcIso(year, s.month, s.day, s.hour, s.minute, s.second)

  if (!templateEndIso) return { startsAt }

  const e = istanbulParts(templateEndIso)
  const endsAt = istanbulLocalToUtcIso(year, e.month, e.day, e.hour, e.minute, e.second)
  return { startsAt, endsAt }
}

/**
 * Annual municipal / festival events keep month-day-time in stored ISO templates.
 * Rolls forward to the current or next occurrence so listings survive year boundaries.
 */
export function resolveEventSchedule(
  event: ScheduleInput,
  nowIso: string = new Date().toISOString()
): { startsAt: string; endsAt?: string } {
  if (event.recurrence !== 'annual') {
    return { startsAt: event.startsAt, endsAt: event.endsAt }
  }

  const nowYear = istanbulParts(nowIso).year

  for (const year of [nowYear, nowYear + 1]) {
    const occ = buildOccurrence(event.startsAt, event.endsAt, year)
    const activeUntil = occ.endsAt ?? occ.startsAt
    if (activeUntil >= nowIso) return occ
  }

  return buildOccurrence(event.startsAt, event.endsAt, nowYear + 1)
}

export function withResolvedSchedule<T extends ScheduleInput>(
  event: T,
  nowIso?: string
): T & { startsAt: string; endsAt?: string } {
  const resolved = resolveEventSchedule(event, nowIso)
  return { ...event, ...resolved }
}
