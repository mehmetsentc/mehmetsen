/**
 * SEO-1C.1 — pure helpers for permanent monthly article sitemaps.
 *
 * Month partition contract (tested):
 * - A shard covers one calendar month in **UTC**: [monthStart, nextMonthStart).
 *   `2026-09` = 2026-09-01T00:00:00.000Z (inclusive) … 2026-10-01T00:00:00.000Z (exclusive).
 * - Partition key is the article's `publishedAt` (milliseconds since epoch).
 * - An article therefore belongs to exactly one month shard.
 *
 * File names:
 * - part 1:  articles-YYYY-MM.xml
 * - part N:  articles-YYYY-MM-N.xml  (N >= 2; only when a month exceeds 50,000 URLs)
 */

/** Google sitemap protocol hard limit per file. Never exceed; never truncate. */
export const ARTICLE_SITEMAP_MAX_URLS = 50_000

/** Public path prefix for monthly article shards. */
export const ARTICLE_SITEMAP_DIR = '/sitemaps'

const MONTH_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/
const FILE_RE = /^articles-(\d{4})-(0[1-9]|1[0-2])(?:-([1-9]\d{0,3}))?\.xml$/

export type MonthKey = string

export function isMonthKey(value: string): boolean {
  return MONTH_KEY_RE.test(value)
}

export function monthKeyFromMs(ms: number): MonthKey {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`
}

export function monthBoundsUtc(month: MonthKey): { startMs: number; endMs: number } {
  const match = MONTH_KEY_RE.exec(month)
  if (!match) throw new Error(`invalid month key: ${month}`)
  const y = Number(match[1])
  const m = Number(match[2])
  return { startMs: Date.UTC(y, m - 1, 1), endMs: Date.UTC(y, m, 1) }
}

/** True when `ms` falls inside the month's [start, end) window. */
export function isInMonth(ms: number, month: MonthKey): boolean {
  const { startMs, endMs } = monthBoundsUtc(month)
  return ms >= startMs && ms < endMs
}

/** Closed months are fully in the past relative to `nowMs`. */
export function isClosedMonth(month: MonthKey, nowMs: number): boolean {
  return monthBoundsUtc(month).endMs <= nowMs
}

export type ArticleShardFile = { month: MonthKey; part: number }

export function parseArticleShardFile(file: string): ArticleShardFile | null {
  const match = FILE_RE.exec(file)
  if (!match) return null
  const part = match[3] ? Number(match[3]) : 1
  // Part 1 has exactly one spelling (no "-1" suffix) to avoid duplicate URLs.
  if (match[3] && part < 2) return null
  return { month: `${match[1]}-${match[2]}`, part }
}

export function articleShardFileName(month: MonthKey, part: number): string {
  if (!isMonthKey(month)) throw new Error(`invalid month key: ${month}`)
  if (!Number.isInteger(part) || part < 1) throw new Error(`invalid part: ${part}`)
  return part === 1 ? `articles-${month}.xml` : `articles-${month}-${part}.xml`
}

export function articleShardPath(month: MonthKey, part: number): string {
  return `${ARTICLE_SITEMAP_DIR}/${articleShardFileName(month, part)}`
}

/** Number of files needed for `count` URLs (0 for an empty month). */
export function partCount(count: number, maxPerFile = ARTICLE_SITEMAP_MAX_URLS): number {
  if (maxPerFile > ARTICLE_SITEMAP_MAX_URLS) {
    throw new Error(`sitemap file limit ${maxPerFile} exceeds ${ARTICLE_SITEMAP_MAX_URLS}`)
  }
  return count <= 0 ? 0 : Math.ceil(count / maxPerFile)
}

/** Slice for one part. Throws instead of silently truncating. */
export function slicePart<T>(items: T[], part: number, maxPerFile = ARTICLE_SITEMAP_MAX_URLS): T[] {
  const parts = partCount(items.length, maxPerFile)
  if (part < 1 || part > parts) return []
  const slice = items.slice((part - 1) * maxPerFile, part * maxPerFile)
  if (slice.length > ARTICLE_SITEMAP_MAX_URLS) {
    throw new Error(`sitemap part exceeds ${ARTICLE_SITEMAP_MAX_URLS} URLs`)
  }
  return slice
}

/**
 * Strict timestamp → epoch ms. Accepts epoch ms / epoch seconds numbers,
 * ISO strings, Date and Firestore Timestamp-like objects. Returns null for
 * anything missing or invalid — never "now".
 */
export function toEpochMsStrict(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    return value < 1_000_000_000_000 ? value * 1000 : value
  }
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isFinite(t) && t > 0 ? t : null
  }
  if (typeof value === 'string') {
    if (!value.trim()) return null
    const t = Date.parse(value)
    return Number.isFinite(t) && t > 0 ? t : null
  }
  if (typeof value === 'object') {
    const v = value as { toMillis?: () => number; toDate?: () => Date }
    try {
      if (typeof v.toMillis === 'function') return toEpochMsStrict(v.toMillis())
      if (typeof v.toDate === 'function') return toEpochMsStrict(v.toDate())
    } catch {
      return null
    }
  }
  return null
}

/**
 * Real lastmod: updatedAt when valid and not in the future, else publishedAt.
 * Never earlier than publishedAt.
 */
export function resolveLastmodMs(publishedMs: number, updatedMs: number | null, nowMs: number): number {
  if (updatedMs == null || updatedMs > nowMs) return publishedMs
  return Math.max(publishedMs, updatedMs)
}
