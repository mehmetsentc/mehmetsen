/**
 * SEO-1C.1 — eligibility + month assembly for permanent article sitemaps.
 *
 * Pure (no I/O). Eligibility reuses the exact helpers `/haber/[slug]` uses for
 * robots + canonical, so a URL is listed only when the article page itself is
 * `index` and self-canonical on www:
 *   - isPubliclyVisibleStatus            (page notFound() guard)
 *   - classifyPublicRead + robotsForPublicReadClass (P18.3 policy:
 *       CANONICAL / SYSTEM_ALERT / LEGACY_ALLOWED index; LEGACY_QUARANTINED noindex)
 *   - hasForcedNoindexSignals             (buildPostMetadata hard noindex)
 *   - buildPostSharePath                  (canonical path: /haber/{slug}; id-only and
 *                                          draft placeholder slugs fall back to /post/{id})
 * Firestore docs are additionally classified from the raw document
 * (publicReadMetaFromFirestoreDoc, same as the image sitemap) and must be
 * indexable under both views.
 */
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { buildPostSharePath, hasForcedNoindexSignals } from '@/lib/seo'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import { newsDocToPost } from '@/lib/newsMapper'
import {
  canBeIndexable,
  classifyPublicRead,
  publicReadMetaFromFirestoreDoc,
  publicReadMetaFromPost,
  robotsForPublicReadClass,
} from '@/services/editorial/publicReadPolicy'
import {
  ARTICLE_SITEMAP_MAX_URLS,
  isInMonth,
  partCount,
  resolveLastmodMs,
  slicePart,
  toEpochMsStrict,
  type MonthKey,
} from '@/lib/sitemap/articleSitemapPartition'
import { xmlEscape } from '@/lib/sitemap/seoXml'

/** Compact cached entry: [slug, lastmodEpochSeconds]. Sorted newest first. */
export type ArticleSitemapEntry = [slug: string, lastmodSec: number]

export type ArticleSitemapMonth = {
  month: MonthKey
  entries: ArticleSitemapEntry[]
}

export type PgSitemapCandidate = {
  post: Post
  publishedAt: unknown
  updatedAt: unknown
}

export type FirestoreSitemapCandidate = {
  id: string
  data: Record<string, unknown>
}

type Evaluated = { slug: string; lastmodMs: number; publishedMs: number }

const MAX_SLUG_LENGTH = 300

/** URL-path safety only (no SEO judgement): one path segment, no whitespace. */
function isSafeSlugSegment(slug: string): boolean {
  if (!slug || slug.length > MAX_SLUG_LENGTH) return false
  return !/[\s/?#\\]/.test(slug)
}

export function evaluateSitemapCandidate(input: {
  post: Post | null
  month: MonthKey
  nowMs: number
  publishedAt: unknown
  updatedAt: unknown
  rawFirestore?: FirestoreSitemapCandidate
}): Evaluated | null {
  const { post, month, nowMs } = input
  if (!post) return null

  const publishedMs = toEpochMsStrict(input.publishedAt)
  if (publishedMs == null || publishedMs > nowMs || !isInMonth(publishedMs, month)) return null

  if (!isPubliclyVisibleStatus(post.status)) return null
  const readClass = classifyPublicRead(publicReadMetaFromPost(post))
  if (!robotsForPublicReadClass(readClass).index) return null
  if (input.rawFirestore) {
    const rawClass = classifyPublicRead(
      publicReadMetaFromFirestoreDoc(input.rawFirestore.id, input.rawFirestore.data)
    )
    if (!canBeIndexable(rawClass)) return null
  }
  if (hasForcedNoindexSignals(post as Post & { seoNoindex?: boolean; publisherType?: string })) {
    return null
  }

  const slug = (post.slug ?? '').trim()
  if (!isSafeSlugSegment(slug)) return null
  // Canonical ownership: only posts whose canonical path is /haber/{slug}.
  if (buildPostSharePath(post) !== ROUTES.NEWS_DETAIL(slug)) return null

  const lastmodMs = resolveLastmodMs(publishedMs, toEpochMsStrict(input.updatedAt), nowMs)
  return { slug, lastmodMs, publishedMs }
}

/**
 * Assemble one month. PostgreSQL wins (mirrors getNewsBySlug: PG first, then
 * Firestore). A Firestore doc is skipped when its slug or id is a PG identity
 * key, because the article page for that slug is served from PG.
 * Dedupe key = canonical slug (→ one canonical URL).
 */
export function buildArticleMonth(input: {
  month: MonthKey
  nowMs: number
  pg: PgSitemapCandidate[]
  firestore: FirestoreSitemapCandidate[]
  pgIdentityKeys: Iterable<string>
}): ArticleSitemapMonth {
  const { month, nowMs } = input
  const bySlug = new Map<string, Evaluated>()

  for (const row of input.pg) {
    const ev = evaluateSitemapCandidate({
      post: row.post,
      month,
      nowMs,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
    })
    if (ev && !bySlug.has(ev.slug)) bySlug.set(ev.slug, ev)
  }

  const claimed = new Set<string>()
  for (const key of input.pgIdentityKeys) {
    const k = key.trim()
    if (k) claimed.add(k)
  }

  for (const doc of input.firestore) {
    const rawSlug = typeof doc.data.slug === 'string' ? doc.data.slug.trim() : ''
    if (claimed.has(doc.id) || (rawSlug && claimed.has(rawSlug))) continue
    const post = newsDocToPost(doc.id, doc.data as Parameters<typeof newsDocToPost>[1])
    const ev = evaluateSitemapCandidate({
      post,
      month,
      nowMs,
      publishedAt: doc.data.publishedAt,
      updatedAt: doc.data.updatedAt,
      rawFirestore: doc,
    })
    if (!ev) continue
    const existing = bySlug.get(ev.slug)
    if (!existing) {
      bySlug.set(ev.slug, ev)
    } else if (ev.lastmodMs > existing.lastmodMs && existing.publishedMs === ev.publishedMs) {
      bySlug.set(ev.slug, ev)
    }
  }

  const entries = [...bySlug.values()]
    .sort((a, b) => b.publishedMs - a.publishedMs || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((e): ArticleSitemapEntry => [e.slug, Math.floor(e.lastmodMs / 1000)])

  return { month, entries }
}

export type ArticleMonthPartSummary = { part: number; lastmodMs: number }

export function summarizeArticleMonth(
  month: ArticleSitemapMonth,
  maxPerFile = ARTICLE_SITEMAP_MAX_URLS
): ArticleMonthPartSummary[] {
  const parts = partCount(month.entries.length, maxPerFile)
  const out: ArticleMonthPartSummary[] = []
  for (let part = 1; part <= parts; part++) {
    const slice = slicePart(month.entries, part, maxPerFile)
    let newest = 0
    for (const [, sec] of slice) if (sec > newest) newest = sec
    out.push({ part, lastmodMs: newest * 1000 })
  }
  return out
}

function locFor(base: string, slug: string): string {
  const path = ROUTES.NEWS_DETAIL(slug)
  const safe = /[^\x21-\x7E]/.test(path) ? encodeURI(path) : path
  return xmlEscape(`${base.replace(/\/$/, '')}${safe}`)
}

export function articleUrlsetXml(base: string, entries: ArticleSitemapEntry[]): string {
  if (entries.length > ARTICLE_SITEMAP_MAX_URLS) {
    throw new Error(`article sitemap exceeds ${ARTICLE_SITEMAP_MAX_URLS} URLs`)
  }
  const rows = entries
    .map(
      ([slug, sec]) =>
        `  <url><loc>${locFor(base, slug)}</loc><lastmod>${new Date(sec * 1000).toISOString()}</lastmod></url>`
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows}
</urlset>`
}
