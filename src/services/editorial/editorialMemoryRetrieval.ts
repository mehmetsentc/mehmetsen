/**
 * Faz A3 — Editorial Memory Manual Shadow Sandbox V1.
 * READ-ONLY historical retrieval service.
 *
 * Responsibility (kept deliberately separate from crawler event clustering,
 * per A2.1's "hard architecture decision"):
 *   DEDUPE (services/newsroom/dedupe/similarityEngine.ts, 48h lookback)
 *     = "are these incoming source articles describing the same current event?"
 *   EDITORIAL MEMORY (this file)
 *     = "which OLDER NaHaber publications could provide useful historical
 *        context for this new editorial candidate?"
 *
 * Hard invariants enforced here (do not weaken without a new phase):
 *  - Zero AI provider calls. Zero embeddings. Zero vector DB.
 *  - Zero DB writes — every query below is a SELECT.
 *  - `eventKey` / `buildEventFingerprint` are NEVER required — optional
 *    diagnostic evidence only (RECENT_CLUSTER_MATCH), never wired here in A3.
 *  - Memory source is PostgreSQL canonical `news` ONLY (see
 *    publicReadPolicy.canBeMemoryContext — CANONICAL only in V1).
 *  - Every DB query has a hard LIMIT — never scans the full corpus.
 *  - Self/future exclusion is mandatory (Task 6).
 *  - Relationship labels are conservative: LIKELY_RELATED / POSSIBLY_RELATED /
 *    UNRESOLVED only. Never SAME_EVENT. Never VERIFIED_FACT.
 */

import { and, desc, eq, gte, lt, ne, or, type SQL } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { canonicalPublishedWhere } from '@/lib/canonical/canonicalEligibility'
import { classifyPublicRead, canBeMemoryContext, type PublicReadArticleMeta } from '@/services/editorial/publicReadPolicy'
import { namedTokensFrom, extractNumbers } from '@/services/crawler/cluster/fingerprint'
import { jaccard, tokenizeNormalized } from '@/services/crawler/cluster/normalize'
import type {
  HistoricalRetrievalInput,
  HistoricalRetrievalEditorContext,
  HistoricalRetrievalResult,
  HistoricalArticleContext,
  MemoryEvidence,
  MemoryEvidenceTag,
  MemoryAgeBucket,
  RelationshipConfidence,
} from './editorialMemoryTypes'

/** Reuses similarityEngine.MAX_CANDIDATES's *value* (80) as a bounded-query budget — not its import, not its 48h query. */
const MAX_CANDIDATES_PER_BUCKET = 80
const MAX_RESULTS = 5
/** Reuses similarityEngine.TITLE_ONLY_THRESHOLD's *value* as a reference point for "strong" title overlap. CALIBRATION REQUIRED (A2.1 Bölüm 11/13). */
const STRONG_TITLE_OVERLAP = 0.46
const STRONG_NAMED_OVERLAP = 0.3

interface BucketDef {
  id: MemoryAgeBucket
  minHoursAgo: number
  maxHoursAgo: number | null
  /** Freshness is a weighting signal, not a hard exclusion (A2.1 Task 5 / Bölüm 6). HYPOTHESIS values — CALIBRATION REQUIRED. */
  weight: number
}

export const BUCKETS: BucketDef[] = [
  { id: '2-7d', minHoursAgo: 48, maxHoursAgo: 24 * 7, weight: 1.0 },
  { id: '8-30d', minHoursAgo: 24 * 7, maxHoursAgo: 24 * 30, weight: 0.95 },
  { id: '1-3mo', minHoursAgo: 24 * 30, maxHoursAgo: 24 * 90, weight: 0.85 },
  { id: '3-12mo', minHoursAgo: 24 * 90, maxHoursAgo: 24 * 365, weight: 0.75 },
  { id: '12mo+', minHoursAgo: 24 * 365, maxHoursAgo: null, weight: 0.65 },
]

type NewsRow = typeof news.$inferSelect

/**
 * Task 6 — mandatory self/future exclusion, enforced a SECOND time here in
 * plain JS (defense-in-depth on top of the SQL `ne()`/`lt()` conditions in
 * stageACandidatesForBucket). Independently unit-testable without a live DB.
 * Never returns true for the current article itself, its slug, or anything
 * published at/after the reference article's own publishedAt.
 */
export function passesSelfAndFutureExclusion(
  row: Pick<NewsRow, 'id' | 'slug' | 'publishedAt'>,
  input: HistoricalRetrievalInput,
  referenceTime: Date
): boolean {
  if (input.articleId && row.id === input.articleId) return false
  if (input.slug && row.slug === input.slug) return false
  if (!row.publishedAt) return false
  if (row.publishedAt.getTime() >= referenceTime.getTime()) return false
  return true
}

export function rowToReadClass(row: NewsRow) {
  const meta: PublicReadArticleMeta = {
    id: row.id,
    title: row.title,
    status: row.status,
    slug: row.slug,
    visibility: null,
    publicationAuthority: row.publicationAuthority,
    publishedBy: row.publishedBy,
    approvedBy: row.approvedBy,
    authorId: row.authorId,
    aiAutoPublished: null,
    needsReview: null,
    needsAdminReview: null,
    seoNoindex: null,
    publisherType: null,
    // These rows come directly from the PG canonical `news` table via
    // canonicalPublishedWhere() — this is the definition of "fromCanonicalPg".
    fromCanonicalPg: true,
  }
  return classifyPublicRead(meta)
}

async function stageACandidatesForBucket(
  db: ReturnType<typeof getDb>,
  input: HistoricalRetrievalInput,
  editorCtx: HistoricalRetrievalEditorContext | undefined,
  bucket: BucketDef,
  referenceTime: Date
): Promise<NewsRow[]> {
  const upperBound = new Date(referenceTime.getTime() - bucket.minHoursAgo * 3_600_000)
  const lowerBound =
    bucket.maxHoursAgo != null ? new Date(referenceTime.getTime() - bucket.maxHoursAgo * 3_600_000) : null

  const conditions: SQL[] = [canonicalPublishedWhere() as SQL, lt(news.publishedAt, upperBound)]
  if (lowerBound) conditions.push(gte(news.publishedAt, lowerBound))
  // Task 6 — mandatory self/future exclusion.
  if (input.articleId) conditions.push(ne(news.id, input.articleId))
  if (input.slug) conditions.push(ne(news.slug, input.slug))

  // Task 8 — high-recall, indexed structural filter. "same city OR same
  // category" already produces candidates; not every signal is required.
  const geoOrTopic: SQL[] = []
  if (input.citySlug) geoOrTopic.push(eq(news.citySlug, input.citySlug))
  if (input.categoryId) geoOrTopic.push(eq(news.categoryId, input.categoryId))
  if (editorCtx?.citySlug) geoOrTopic.push(eq(news.citySlug, editorCtx.citySlug))
  for (const c of editorCtx?.managedCategories ?? []) geoOrTopic.push(eq(news.categoryId, c))
  if (geoOrTopic.length > 0) conditions.push(or(...geoOrTopic) as SQL)

  return db
    .select()
    .from(news)
    .where(and(...conditions))
    .orderBy(desc(news.publishedAt))
    .limit(MAX_CANDIDATES_PER_BUCKET)
}

export function computeEvidence(
  input: HistoricalRetrievalInput,
  candidate: NewsRow
): MemoryEvidence[] {
  const evidence: MemoryEvidence[] = []

  if (input.citySlug && candidate.citySlug && input.citySlug === candidate.citySlug) {
    evidence.push({ tag: 'SHARED_GEO', labelTr: 'Aynı şehir', weight: 1 })
  }
  if (input.categoryId && candidate.categoryId && input.categoryId === candidate.categoryId) {
    evidence.push({ tag: 'SHARED_TOPIC_TOKEN', labelTr: 'Aynı kategori', weight: 0.4 })
  }

  const namedA = new Set(namedTokensFrom(input.headline, 'tr'))
  const namedB = new Set(namedTokensFrom(candidate.title, 'tr'))
  const namedOverlap = jaccard(namedA, namedB)
  if (namedOverlap > 0) {
    evidence.push({ tag: 'SHARED_NAMED_TOKEN', labelTr: 'Ortak isim/terim', weight: namedOverlap })
  }

  const titleSim = jaccard(
    new Set(tokenizeNormalized(input.headline, 'tr')),
    new Set(tokenizeNormalized(candidate.title, 'tr'))
  )
  if (titleSim > 0) {
    evidence.push({ tag: 'TITLE_OVERLAP', labelTr: 'Başlık benzerliği', weight: titleSim })
  }

  const candidateSummary = candidate.summary || candidate.description || ''
  if (input.summary && candidateSummary) {
    const summarySim = jaccard(
      new Set(tokenizeNormalized(input.summary, 'tr')),
      new Set(tokenizeNormalized(candidateSummary, 'tr'))
    )
    if (summarySim > 0) {
      evidence.push({ tag: 'SUMMARY_OVERLAP', labelTr: 'Özet benzerliği', weight: summarySim })
    }
  }

  const numsA = new Set(extractNumbers(`${input.headline} ${input.summary || ''}`))
  const numsB = new Set(extractNumbers(`${candidate.title} ${candidateSummary}`))
  const sharedNums = [...numsA].filter((n) => numsB.has(n))
  if (sharedNums.length > 0) {
    evidence.push({
      tag: 'SHARED_NUMBER',
      labelTr: `Ortak sayı (${sharedNums.slice(0, 3).join(', ')})`,
      weight: Math.min(1, sharedNums.length / 3),
    })
  }

  return evidence
}

/**
 * A2.1 Bölüm 8 combination rule, carried forward. Deliberately conservative —
 * never returns SAME_EVENT. Named-token overlap ALONE (no geo, no title,
 * no number, no summary corroboration) stays UNRESOLVED, never promoted
 * (A2 Task 7 / A2.1 Task 8 entity-identity caution).
 */
export function labelRelationship(evidence: MemoryEvidence[]): RelationshipConfidence {
  const byTag = new Map(evidence.map((e) => [e.tag, e.weight] as [MemoryEvidenceTag, number]))
  const strongTitle = (byTag.get('TITLE_OVERLAP') ?? 0) >= STRONG_TITLE_OVERLAP
  const strongNamed = (byTag.get('SHARED_NAMED_TOKEN') ?? 0) >= STRONG_NAMED_OVERLAP
  const hasGeo = byTag.has('SHARED_GEO')

  if (evidence.length >= 3 && (strongTitle || (strongNamed && hasGeo))) return 'LIKELY_RELATED'
  if (evidence.length === 1 && byTag.has('SHARED_NAMED_TOKEN')) return 'UNRESOLVED'
  if (evidence.length >= 1) return 'POSSIBLY_RELATED'
  return 'UNRESOLVED'
}

export function toHistoricalArticleContext(
  candidate: NewsRow,
  evidence: MemoryEvidence[],
  ageBucket: MemoryAgeBucket,
  bucketWeight: number
): HistoricalArticleContext | null {
  // Task 11 fail-closed invariant: only ever return CANONICAL/HIGH. This is
  // a genuine defensive re-check via the real classifier, not an assumption.
  const cls = rowToReadClass(candidate)
  if (!canBeMemoryContext(cls) || cls !== 'CANONICAL') return null
  if (!candidate.publishedAt) return null

  const rawScore = evidence.reduce((sum, e) => sum + e.weight, 0)
  return {
    articleId: candidate.id,
    slug: candidate.slug,
    headline: candidate.title,
    publishedAt: candidate.publishedAt.toISOString(),
    summary: candidate.summary || candidate.description || null,
    category: candidate.categoryId,
    geography:
      candidate.citySlug || candidate.districtSlug
        ? { citySlug: candidate.citySlug, districtSlug: candidate.districtSlug }
        : null,
    publicReadClass: 'CANONICAL',
    trustTier: 'HIGH',
    source: candidate.source,
    ageBucket,
    retrievalScore: Number((rawScore * bucketWeight).toFixed(4)),
    evidence,
    relationshipConfidence: labelRelationship(evidence),
  }
}

/**
 * Main entry point. READ ONLY. No AI call. No DB write. No mutation of the
 * `news` row or any other table. Safe to call from a manual admin action
 * independent of `memoryEnabled` (A3 Task 1 correction #3) or
 * EDITORIAL_MEMORY_MODE (Task 17 — mode gates background/runtime use only).
 */
export async function retrieveHistoricalContext(
  input: HistoricalRetrievalInput,
  editorCtx?: HistoricalRetrievalEditorContext
): Promise<HistoricalRetrievalResult> {
  if (!hasDatabaseUrl()) {
    return { results: [], noResultReason: 'NO_DATABASE_URL' }
  }
  if (!input.headline || !input.headline.trim()) {
    return { results: [], noResultReason: 'NO_CANONICAL_CANDIDATES' }
  }

  const referenceTime = input.publishedAt ? new Date(input.publishedAt) : new Date()
  const db = getDb()

  const candidatesConsideredByBucket: Record<MemoryAgeBucket, number> = {
    '2-7d': 0,
    '8-30d': 0,
    '1-3mo': 0,
    '3-12mo': 0,
    '12mo+': 0,
  }

  let allContexts: HistoricalArticleContext[] = []
  let totalCandidateRows = 0

  try {
    for (const bucket of BUCKETS) {
      const rows = await stageACandidatesForBucket(db, input, editorCtx, bucket, referenceTime)
      candidatesConsideredByBucket[bucket.id] = rows.length
      totalCandidateRows += rows.length

      for (const row of rows) {
        if (!passesSelfAndFutureExclusion(row, input, referenceTime)) continue
        const evidence = computeEvidence(input, row)
        if (evidence.length === 0) continue // no signal at all — not shown, not "UNRELATED"-labeled
        const ctx = toHistoricalArticleContext(row, evidence, bucket.id, bucket.weight)
        if (ctx) allContexts.push(ctx)
      }
    }
  } catch (error) {
    console.warn('[editorialMemoryRetrieval] query error:', error)
    return { results: [], noResultReason: 'QUERY_ERROR', candidatesConsideredByBucket }
  }

  if (totalCandidateRows === 0) {
    return { results: [], noResultReason: 'NO_CANONICAL_CANDIDATES', candidatesConsideredByBucket }
  }

  // Dedupe by articleId (a row could theoretically satisfy more than one
  // bucket's window only in a boundary edge case; keep the first/best).
  const seen = new Set<string>()
  const deduped: HistoricalArticleContext[] = []
  for (const ctx of allContexts.sort((a, b) => b.retrievalScore - a.retrievalScore)) {
    if (seen.has(ctx.articleId)) continue
    seen.add(ctx.articleId)
    deduped.push(ctx)
  }

  if (deduped.length === 0) {
    return { results: [], noResultReason: 'NO_CANDIDATES_PASSED_SAFETY_FILTER', candidatesConsideredByBucket }
  }

  return { results: deduped.slice(0, MAX_RESULTS), candidatesConsideredByBucket }
}
