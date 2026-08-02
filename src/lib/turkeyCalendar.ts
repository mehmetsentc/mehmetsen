/** Turkey (Europe/Istanbul, UTC+3) calendar helpers for day-scoped feeds. */

const TR_OFFSET_MS = 3 * 60 * 60 * 1000

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export function isTurkeyYmd(value: string): boolean {
  return YMD_RE.test(value)
}

/** Calendar day YYYY-MM-DD in Turkey for a unix/ms timestamp. */
export function turkeyYmd(ms: number): string {
  const tr = new Date(ms + TR_OFFSET_MS)
  return tr.toISOString().slice(0, 10)
}

export function turkeyYmdNow(nowMs = Date.now()): string {
  return turkeyYmd(nowMs)
}

/** Shift a Turkey YMD by `delta` calendar days. */
export function addTurkeyDays(ymd: string, delta: number): string {
  const ms = Date.parse(`${ymd}T12:00:00.000Z`) + delta * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Half-open [startMs, endMs) bounds for a Turkey calendar day. */
export function turkeyDayBounds(ymd: string): { startMs: number; endMs: number } {
  const startMs = Date.parse(`${ymd}T00:00:00+03:00`)
  return { startMs, endMs: startMs + 86_400_000 }
}

/** Previous Turkey day relative to an ISO/ms publish time (or yesterday if missing). */
export function previousTurkeyDayFromPublishedAt(
  publishedAt: string | number | null | undefined,
  nowMs = Date.now()
): string {
  if (publishedAt == null || publishedAt === '') {
    return addTurkeyDays(turkeyYmdNow(nowMs), -1)
  }
  const ms = typeof publishedAt === 'number' ? publishedAt : Date.parse(String(publishedAt))
  if (!Number.isFinite(ms)) return addTurkeyDays(turkeyYmdNow(nowMs), -1)
  return addTurkeyDays(turkeyYmd(ms), -1)
}
