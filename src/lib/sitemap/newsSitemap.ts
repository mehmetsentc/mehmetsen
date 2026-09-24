/**
 * SEO-2B — Google News sitemap (last 48 hours).
 *
 * Source authority = the same as the permanent monthly article sitemaps
 * (SEO-1C.1): Firestore `news` (published) + PostgreSQL canonical `news`,
 * PG wins on shared identity. Eligibility is NOT re-implemented here: every
 * candidate goes through `evaluateSitemapCandidate`, i.e. the exact
 * robots/canonical rules of `/haber/[slug]` (CANONICAL, SYSTEM_ALERT and
 * LEGACY_ALLOWED index; quarantined / not public / forced-noindex / id-only /
 * placeholder slugs are excluded).
 *
 * News-specific rules:
 *   - window: now − 48h <= publishedAt <= now (original publishedAt only;
 *     never updatedAt / lastmod / now())
 *   - title: the article headline (post.title); missing headline => excluded
 *   - <= 1,000 <news:news> per file; above that the root becomes a sitemap index
 *   - a raw source count above NEWS_SITEMAP_RAW_CAP fails closed (no partial file)
 */
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import {
  evaluateSitemapCandidate,
  type FirestoreSitemapCandidate,
} from '@/lib/sitemap/articleSitemapEntries'
import {
  monthKeyFromMs,
  partCount,
  slicePart,
  toEpochMsStrict,
} from '@/lib/sitemap/articleSitemapPartition'
import { newsDocToPost } from '@/lib/newsMapper'
import { xmlEscape } from '@/lib/sitemap/seoXml'

export const NEWS_SITEMAP_WINDOW_MS = 48 * 60 * 60 * 1000
/** Google: max 1,000 <news:news> tags per news sitemap. */
export const NEWS_SITEMAP_MAX_ENTRIES = 1000
/** Defensive ceiling for raw rows inside the 48h window (per source). */
export const NEWS_SITEMAP_RAW_CAP = 5000
export const NEWS_SITEMAP_REVALIDATE_S = 300
export const NEWS_SITEMAP_LANGUAGE = 'tr'

export const NEWS_SITEMAP_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=300'
export const NEWS_SITEMAP_ERROR_CACHE_CONTROL = 'no-store'

/**
 * Publication name — same identity the site already uses for the
 * NewsArticle / NewsMediaOrganization publisher (NEXT_PUBLIC_APP_NAME, "NaHaber").
 */
export function newsPublicationName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
}

export class NewsSitemapCapExceededError extends Error {
  constructor(source: string, count: number) {
    super(`news sitemap ${source} rows ${count} exceed cap ${NEWS_SITEMAP_RAW_CAP}`)
    this.name = 'NewsSitemapCapExceededError'
  }
}

/** Compact cached entry. Sorted newest publishedAt first. */
export type NewsSitemapEntry = { slug: string; publishedMs: number; title: string }

export type PgNewsCandidate = {
  post: Post
  publishedAt: unknown
  updatedAt: unknown
  title: unknown
}

function cleanTitle(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function evaluateNewsCandidate(input: {
  post: Post | null
  nowMs: number
  publishedAt: unknown
  updatedAt: unknown
  title: unknown
  rawFirestore?: FirestoreSitemapCandidate
}): NewsSitemapEntry | null {
  const publishedMs = toEpochMsStrict(input.publishedAt)
  if (publishedMs == null) return null
  if (publishedMs < input.nowMs - NEWS_SITEMAP_WINDOW_MS || publishedMs > input.nowMs) return null
  const ev = evaluateSitemapCandidate({
    post: input.post,
    month: monthKeyFromMs(publishedMs),
    nowMs: input.nowMs,
    publishedAt: input.publishedAt,
    updatedAt: input.updatedAt,
    rawFirestore: input.rawFirestore,
  })
  if (!ev) return null
  const title = cleanTitle(input.title)
  if (!title) return null
  return { slug: ev.slug, publishedMs: ev.publishedMs, title }
}

/**
 * Merge PG + Firestore for the 48h window. PG wins (mirrors getNewsBySlug);
 * a Firestore doc whose slug or id is a PG identity key is skipped.
 */
export function buildNewsSitemapEntries(input: {
  nowMs: number
  pg: PgNewsCandidate[]
  firestore: FirestoreSitemapCandidate[]
  pgIdentityKeys: Iterable<string>
}): NewsSitemapEntry[] {
  const { nowMs } = input
  const bySlug = new Map<string, NewsSitemapEntry>()

  for (const row of input.pg) {
    const e = evaluateNewsCandidate({
      post: row.post,
      nowMs,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      title: row.title,
    })
    if (e && !bySlug.has(e.slug)) bySlug.set(e.slug, e)
  }

  const claimed = new Set<string>()
  for (const key of input.pgIdentityKeys) {
    const k = key.trim()
    if (k) claimed.add(k)
  }

  for (const doc of input.firestore) {
    const rawSlug = typeof doc.data.slug === 'string' ? doc.data.slug.trim() : ''
    if (claimed.has(doc.id) || (rawSlug && claimed.has(rawSlug))) continue
    const e = evaluateNewsCandidate({
      post: newsDocToPost(doc.id, doc.data as Parameters<typeof newsDocToPost>[1]),
      nowMs,
      publishedAt: doc.data.publishedAt,
      updatedAt: doc.data.updatedAt,
      title: doc.data.title,
      rawFirestore: doc,
    })
    if (e && !bySlug.has(e.slug)) bySlug.set(e.slug, e)
  }

  return [...bySlug.values()].sort(
    (a, b) => b.publishedMs - a.publishedMs || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
  )
}

/** Drop entries that aged out of the window since the cached computation. */
export function entriesInWindow(entries: NewsSitemapEntry[], nowMs: number): NewsSitemapEntry[] {
  const from = nowMs - NEWS_SITEMAP_WINDOW_MS
  return entries.filter((e) => e.publishedMs >= from && e.publishedMs <= nowMs)
}

export function newsPartCount(count: number): number {
  return partCount(count, NEWS_SITEMAP_MAX_ENTRIES)
}

export function newsSlice(entries: NewsSitemapEntry[], part: number): NewsSitemapEntry[] {
  const slice = slicePart(entries, part, NEWS_SITEMAP_MAX_ENTRIES)
  if (slice.length > NEWS_SITEMAP_MAX_ENTRIES) throw new Error('news sitemap part exceeds 1000')
  return slice
}

export function newsChildPath(part: number): string {
  return `/news-sitemaps/news-${part}.xml`
}

export function parseNewsChildFile(file: string): number | null {
  const m = /^news-([1-9]\d{0,3})\.xml$/.exec(file)
  return m ? Number(m[1]) : null
}

function locFor(base: string, slug: string): string {
  const path = ROUTES.NEWS_DETAIL(slug)
  const safe = /[^\x21-\x7E]/.test(path) ? encodeURI(path) : path
  return xmlEscape(`${base.replace(/\/$/, '')}${safe}`)
}

export function newsUrlsetXml(
  base: string,
  entries: NewsSitemapEntry[],
  publicationName = newsPublicationName()
): string {
  if (entries.length > NEWS_SITEMAP_MAX_ENTRIES) {
    throw new Error(`news sitemap urlset exceeds ${NEWS_SITEMAP_MAX_ENTRIES}`)
  }
  const name = xmlEscape(publicationName)
  const rows = entries
    .map(
      (e) => `  <url>
    <loc>${locFor(base, e.slug)}</loc>
    <news:news>
      <news:publication>
        <news:name>${name}</news:name>
        <news:language>${NEWS_SITEMAP_LANGUAGE}</news:language>
      </news:publication>
      <news:publication_date>${new Date(e.publishedMs).toISOString()}</news:publication_date>
      <news:title>${xmlEscape(e.title)}</news:title>
    </news:news>
  </url>`
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${rows}
</urlset>`
}

export function newsSitemapIndexXml(base: string, parts: number): string {
  const root = base.replace(/\/$/, '')
  const items = Array.from(
    { length: parts },
    (_, i) => `  <sitemap>\n    <loc>${xmlEscape(`${root}${newsChildPath(i + 1)}`)}</loc>\n  </sitemap>`
  ).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`
}
