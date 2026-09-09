import { and, desc, inArray, isNotNull, lt, or, eq, sql } from 'drizzle-orm'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getDb, hasDatabaseUrl } from '@/db'
import { clusterMemberships, rawArticles } from '@/db/schema/crawler'
import { selectSmartFeedSummary } from '@/lib/feed/smartFeedSummary'
import {
  canAppearInSmartFeed,
  classifyPublicRead,
  publicReadMetaFromFirestoreDoc,
} from '@/services/editorial/publicReadPolicy'
import { isPrimaryMembershipRole } from '@/lib/publisher/provenance'
import type { PublisherArticleItem, PublisherArticlePage } from '@/types/publisher'

function parsePublishedAt(value: unknown): Date | null {
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value)
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const maybe = value as { toDate?: () => Date }
    if (typeof maybe.toDate === 'function') return maybe.toDate()
  }
  return null
}

export function encodePublisherArticleCursor(publishedAt: Date, id: string): string {
  return Buffer.from(`${publishedAt.getTime()}:${id}`, 'utf8').toString('base64url')
}

export function decodePublisherArticleCursor(
  cursor: string
): { publishedAtMs: number; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const sep = raw.lastIndexOf(':')
    if (sep <= 0) return null
    const publishedAtMs = Number(raw.slice(0, sep))
    const id = raw.slice(sep + 1)
    if (!Number.isFinite(publishedAtMs) || !id) return null
    return { publishedAtMs, id }
  } catch {
    return null
  }
}

function mapFirestoreDoc(
  docId: string,
  data: FirebaseFirestore.DocumentData,
  sourceId: string
): PublisherArticleItem | null {
  const readClass = classifyPublicRead(
    publicReadMetaFromFirestoreDoc(docId, data as Record<string, unknown>)
  )
  if (!canAppearInSmartFeed(readClass)) return null

  const title = String(data.title ?? '').trim()
  const slug = String(data.slug ?? '').trim()
  if (!title || !slug || slug === docId) return null

  const publishedAt =
    parsePublishedAt(data.publishedAt) ??
    parsePublishedAt(data.createdAt) ??
    parsePublishedAt(data.updatedAt)

  const thumbnailUrl =
    String(data.coverImageUrl ?? data.thumbnail ?? data.imageUrl ?? '').trim() || null

  const categoryId =
    typeof data.categoryId === 'string'
      ? data.categoryId.trim().toLowerCase()
      : typeof data.category === 'string'
        ? data.category.trim().toLowerCase()
        : null

  const summary = selectSmartFeedSummary({
    smartFeedSummary: typeof data.smartFeedSummary === 'string' ? data.smartFeedSummary : null,
    summary: typeof data.summary === 'string' ? data.summary : null,
    spot: typeof data.spot === 'string' ? data.spot : null,
    description: typeof data.description === 'string' ? data.description : null,
  })

  return {
    id: docId,
    slug,
    title,
    summary,
    thumbnailUrl,
    publishedAt,
    sourceId,
    categoryId: categoryId || undefined,
  }
}

const MAX_RAW_SCAN_ATTEMPTS = 4
const RAW_BATCH = 60

/**
 * Deterministic provenance path:
 * publisher_sources → raw_articles.source_id → editorial_news_id → Firestore published doc
 * filtered by P18 public read policy (LEGACY_QUARANTINED excluded).
 *
 * Does NOT render raw article bodies. Does NOT change ownership/claims.
 */
export async function fetchFirestorePublisherArticles(input: {
  sourceIds: string[]
  limit: number
  cursor?: string | null
  excludeIds?: Set<string>
  categoryId?: string | null
}): Promise<PublisherArticlePage> {
  const limit = Math.min(Math.max(input.limit, 1), 48)
  const excludeIds = input.excludeIds ?? new Set<string>()
  const sourceIds = [...new Set(input.sourceIds.filter(Boolean))].slice(0, 30)
  if (!sourceIds.length || !hasDatabaseUrl()) return { items: [], nextCursor: null }

  const cursorInfo = input.cursor ? decodePublisherArticleCursor(input.cursor) : null
  const category = input.categoryId?.trim().toLowerCase() || null
  const db = getDb()
  const fs = getAdminFirestore()

  const collected: PublisherArticleItem[] = []
  const seen = new Set<string>(excludeIds)
  let attempts = 0
  let boundaryMs = cursorInfo?.publishedAtMs ?? null
  let boundaryId = cursorInfo?.id ?? null

  while (collected.length < limit + 1 && attempts < MAX_RAW_SCAN_ATTEMPTS) {
    attempts += 1
    const whereParts = [
      inArray(rawArticles.sourceId, sourceIds),
      isNotNull(rawArticles.editorialNewsId),
    ]
    if (boundaryMs != null) {
      const boundaryDate = new Date(boundaryMs)
      whereParts.push(
        or(
          lt(rawArticles.publishedAt, boundaryDate),
          and(eq(rawArticles.publishedAt, boundaryDate), boundaryId ? lt(rawArticles.id, boundaryId) : sql`true`)
        )!
      )
    }

    // LP7R.1 provenance hardening: only raw articles this source's cluster
    // membership was PRIMARY for are eligible to hydrate as "this publisher's
    // article" — see resolvePublishedArticles' branch 2 for the full rationale.
    const rawRows0 = await db
      .select({
        id: rawArticles.id,
        editorialNewsId: rawArticles.editorialNewsId,
        sourceId: rawArticles.sourceId,
        publishedAt: rawArticles.publishedAt,
        membershipRole: clusterMemberships.membershipRole,
      })
      .from(rawArticles)
      .innerJoin(
        clusterMemberships,
        and(
          eq(clusterMemberships.articleId, rawArticles.id),
          eq(clusterMemberships.membershipRole, 'PRIMARY')
        )
      )
      .where(and(...whereParts))
      .orderBy(desc(rawArticles.publishedAt), desc(rawArticles.id))
      .limit(RAW_BATCH)

    if (!rawRows0.length) break

    const lastRaw = rawRows0[rawRows0.length - 1]!
    boundaryMs = lastRaw.publishedAt?.getTime() ?? boundaryMs
    boundaryId = lastRaw.id

    // Defense in depth: re-check with the shared, unit-tested predicate
    // rather than trusting the SQL join silently. See provenance.ts.
    const rawRows = rawRows0.filter((r) => isPrimaryMembershipRole(r.membershipRole))

    const editorialIds = [
      ...new Set(
        rawRows
          .map((r) => r.editorialNewsId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0 && !seen.has(id))
      ),
    ]
    if (!editorialIds.length) {
      if (rawRows0.length < RAW_BATCH) break
      continue
    }

    const sourceByEditorial = new Map<string, string>()
    for (const row of rawRows) {
      if (row.editorialNewsId && row.sourceId && !sourceByEditorial.has(row.editorialNewsId)) {
        sourceByEditorial.set(row.editorialNewsId, row.sourceId)
      }
    }

    try {
      const refs = editorialIds.map((id) => fs.collection(Collections.NEWS).doc(id))
      const snaps = await fs.getAll(...refs)
      for (const snap of snaps) {
        if (!snap.exists) continue
        if (seen.has(snap.id)) continue
        const sourceId = sourceByEditorial.get(snap.id) ?? sourceIds[0]!
        const item = mapFirestoreDoc(snap.id, snap.data()!, sourceId)
        if (!item) continue
        if (category && (item.categoryId || 'gundem') !== category) continue
        seen.add(item.id)
        collected.push(item)
        if (collected.length >= limit + 1) break
      }
    } catch (err) {
      console.warn('[publisher] provenance firestore hydrate failed', err)
      break
    }

    if (rawRows0.length < RAW_BATCH) break
  }

  // LP7R.1 provenance hardening: the previous "Secondary: direct
  // ingestionSourceId query" fallback is REMOVED, not just narrowed.
  // It queried Firestore `news` docs by ingestionSourceId with no link back
  // to a specific raw_articles row, so there was no cluster_memberships row
  // to check a membership role against at all — no reliable way to tell
  // PRIMARY from SUPPORTING for these candidates. Per the LP7 provenance
  // invariant ("if existing data cannot reliably make this distinction: STOP
  // that specific attribution behavior — do not invent provenance"), this
  // fails closed rather than being narrowed to a guess. The primary raw_articles
  // → cluster_memberships path above remains the sole source-linked fallback.

  collected.sort((a, b) => {
    const am = a.publishedAt?.getTime() ?? 0
    const bm = b.publishedAt?.getTime() ?? 0
    if (bm !== am) return bm - am
    return a.id.localeCompare(b.id)
  })

  const items = collected.slice(0, limit)
  const last = items[items.length - 1]
  const nextCursor =
    collected.length > limit && last?.publishedAt
      ? encodePublisherArticleCursor(last.publishedAt, last.id)
      : null

  return { items, nextCursor }
}

/**
 * Bounded eligible count for profile header — same policy as list path.
 * Scans up to `maxScan` provenance editorial IDs (default 400).
 */
export async function countEligibleFirestorePublisherArticles(input: {
  sourceIds: string[]
  maxScan?: number
}): Promise<number> {
  const sourceIds = [...new Set(input.sourceIds.filter(Boolean))].slice(0, 30)
  if (!sourceIds.length || !hasDatabaseUrl()) return 0
  const maxScan = Math.min(Math.max(input.maxScan ?? 400, 50), 800)

  const db = getDb()
  const fs = getAdminFirestore()
  // LP7R.1: same PRIMARY-only provenance constraint as the list path, so the
  // header count never advertises more stories than can actually render.
  const rawRows0 = await db
    .select({ editorialNewsId: rawArticles.editorialNewsId, membershipRole: clusterMemberships.membershipRole })
    .from(rawArticles)
    .innerJoin(
      clusterMemberships,
      and(
        eq(clusterMemberships.articleId, rawArticles.id),
        eq(clusterMemberships.membershipRole, 'PRIMARY')
      )
    )
    .where(and(inArray(rawArticles.sourceId, sourceIds), isNotNull(rawArticles.editorialNewsId)))
    .orderBy(desc(rawArticles.publishedAt))
    .limit(maxScan)
  const rawRows = rawRows0.filter((r) => isPrimaryMembershipRole(r.membershipRole))

  const ids = [...new Set(rawRows.map((r) => r.editorialNewsId).filter((id): id is string => Boolean(id)))]
  let eligible = 0
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const refs = chunk.map((id) => fs.collection(Collections.NEWS).doc(id))
    const snaps = await fs.getAll(...refs)
    for (const snap of snaps) {
      if (!snap.exists) continue
      const item = mapFirestoreDoc(snap.id, snap.data()!, sourceIds[0]!)
      if (item) eligible += 1
    }
  }
  return eligible
}
