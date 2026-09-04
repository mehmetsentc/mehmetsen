/**
 * P18.4E.2 — Read-only canonical draft source-overlap audit.
 *
 * Reuses editorialSimilarityGate (deterministic, NO LLM).
 * NEVER mutates rights_status / rights_basis / editorial_blocker / status.
 * NEVER publishes.
 */

import 'server-only'

import { eq } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { fetchDocument } from '@/services/crawler/http/fetchDocument'
import { extractArticle } from '@/services/crawler/extract/pipeline'
import {
  checkTextSimilarity,
  explainOverlapClassificationFromWeightedScore,
  type OverlapCategory,
} from '@/services/editorial/editorialSimilarityGate'

export type SourceFetchStatus =
  | 'SOURCE_FETCH_OK'
  | 'SOURCE_UNAVAILABLE'
  | 'SOURCE_BODY_UNAVAILABLE'
  | 'SOURCE_CHANGED'
  | 'OTHER'
  | 'SOURCE_URL_MISSING'
  | 'SOURCE_URL_INVALID'

/** Review vocabulary (maps HIGH_OVERLAP → HIGH_SOURCE_OVERLAP for humans). */
export type SourceOverlapRiskClass =
  | 'LOW_OVERLAP'
  | 'MEDIUM_OVERLAP'
  | 'HIGH_SOURCE_OVERLAP'
  | 'SOURCE_NOT_EVALUABLE'

export type CanonicalSourceOverlapAudit = {
  newsId: string
  evaluated: boolean
  aiInvolved: false
  sourceUrl: string | null
  sourceFetchStatus: SourceFetchStatus
  sourceBodyAvailable: boolean
  canonicalBodyChars: number
  sourceBodyChars: number
  /** Overall weighted similarity 0..1 from editorialSimilarityGate. */
  similarity: number | null
  jaccard: number | null
  /** Deep 3-gram overlap ratio. */
  ngram3: number | null
  tokenMatchRatio: number | null
  maxSharedContiguousRun: number | null
  /** Gate-native category (HIGH_OVERLAP / MEDIUM / LOW). */
  gateOverlapCategory: OverlapCategory | null
  /** Human-review risk class — never implies CLEARED. */
  risk: SourceOverlapRiskClass
  /**
   * Exact reason from final weighted score only.
   * maxSharedContiguousRun is EVIDENCE_ONLY and never appears here as an override.
   */
  classificationReason: string
  /** Explicit: LOW_OVERLAP is NOT copyright clearance. */
  clearanceImplied: false
  note: string
}

const MIN_SOURCE_BODY_CHARS = 120

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function mapRisk(category: OverlapCategory): SourceOverlapRiskClass {
  if (category === 'HIGH_OVERLAP') return 'HIGH_SOURCE_OVERLAP'
  if (category === 'MEDIUM_OVERLAP') return 'MEDIUM_OVERLAP'
  return 'LOW_OVERLAP'
}

function unevaluable(
  newsId: string,
  opts: {
    sourceUrl: string | null
    sourceFetchStatus: SourceFetchStatus
    canonicalBodyChars: number
    note: string
  }
): CanonicalSourceOverlapAudit {
  return {
    newsId,
    evaluated: false,
    aiInvolved: false,
    sourceUrl: opts.sourceUrl,
    sourceFetchStatus: opts.sourceFetchStatus,
    sourceBodyAvailable: false,
    canonicalBodyChars: opts.canonicalBodyChars,
    sourceBodyChars: 0,
    similarity: null,
    jaccard: null,
    ngram3: null,
    tokenMatchRatio: null,
    maxSharedContiguousRun: null,
    gateOverlapCategory: null,
    risk: 'SOURCE_NOT_EVALUABLE',
    classificationReason: `SOURCE_NOT_EVALUABLE:${opts.sourceFetchStatus}`,
    clearanceImplied: false,
    note: opts.note,
  }
}

/**
 * Compare canonical PG body vs live source extraction.
 * Read-only — does not write DB.
 */
export async function auditCanonicalDraftSourceOverlap(opts: {
  newsId: string
  /** Injected HTML for tests — skips network. */
  sourceHtmlOverride?: string | null
  timeoutMs?: number
}): Promise<CanonicalSourceOverlapAudit> {
  if (!hasDatabaseUrl()) {
    return unevaluable(opts.newsId, {
      sourceUrl: null,
      sourceFetchStatus: 'OTHER',
      canonicalBodyChars: 0,
      note: 'database_unavailable',
    })
  }

  const db = getDb()
  const rows = await db
    .select({
      id: news.id,
      content: news.content,
      htmlContent: news.htmlContent,
      sourceUrl: news.sourceUrl,
      title: news.title,
    })
    .from(news)
    .where(eq(news.id, opts.newsId.trim()))
    .limit(1)

  const row = rows[0]
  if (!row) {
    return unevaluable(opts.newsId, {
      sourceUrl: null,
      sourceFetchStatus: 'OTHER',
      canonicalBodyChars: 0,
      note: 'news_not_found',
    })
  }

  const canonicalBody = (row.content || row.htmlContent || '').trim()
  const canonicalBodyChars = canonicalBody.length
  const sourceUrl = row.sourceUrl?.trim() || null

  if (!sourceUrl) {
    return unevaluable(row.id, {
      sourceUrl: null,
      sourceFetchStatus: 'SOURCE_URL_MISSING',
      canonicalBodyChars,
      note: 'source_url_missing',
    })
  }
  if (!isValidHttpUrl(sourceUrl)) {
    return unevaluable(row.id, {
      sourceUrl,
      sourceFetchStatus: 'SOURCE_URL_INVALID',
      canonicalBodyChars,
      note: 'source_url_invalid',
    })
  }
  if (canonicalBodyChars < MIN_SOURCE_BODY_CHARS) {
    return unevaluable(row.id, {
      sourceUrl,
      sourceFetchStatus: 'OTHER',
      canonicalBodyChars,
      note: 'canonical_body_too_short_for_comparison',
    })
  }

  let html = opts.sourceHtmlOverride ?? null
  let fetchStatus: SourceFetchStatus = 'SOURCE_FETCH_OK'

  if (html == null) {
    const fetched = await fetchDocument({
      url: sourceUrl,
      timeoutMs: opts.timeoutMs ?? 12_000,
      skipPoliteness: true,
      sourceId: `overlap-audit:${row.id}`,
    })
    if (!fetched.ok || !fetched.body) {
      return unevaluable(row.id, {
        sourceUrl,
        sourceFetchStatus: 'SOURCE_UNAVAILABLE',
        canonicalBodyChars,
        note: `source_fetch_failed:${fetched.errorCode || fetched.status}`,
      })
    }
    html = fetched.body
    fetchStatus = 'SOURCE_FETCH_OK'
  }

  const extracted = extractArticle(html, sourceUrl, 'tr')
  const sourceBody = (extracted.articleBodyText || '').trim()
  if (sourceBody.length < MIN_SOURCE_BODY_CHARS) {
    return unevaluable(row.id, {
      sourceUrl,
      sourceFetchStatus: 'SOURCE_BODY_UNAVAILABLE',
      canonicalBodyChars,
      note: `source_body_too_short:${sourceBody.length}`,
    })
  }

  const sim = checkTextSimilarity(canonicalBody, sourceBody)
  const risk = mapRisk(sim.overlapCategory)

  return {
    newsId: row.id,
    evaluated: true,
    aiInvolved: false,
    sourceUrl,
    sourceFetchStatus: fetchStatus,
    sourceBodyAvailable: true,
    canonicalBodyChars,
    sourceBodyChars: sourceBody.length,
    similarity: sim.similarity,
    jaccard: sim.jaccard,
    ngram3: sim.ngram3,
    tokenMatchRatio: sim.tokenMatchRatio,
    maxSharedContiguousRun: sim.maxSharedContiguousRun,
    gateOverlapCategory: sim.overlapCategory,
    risk,
    classificationReason: explainOverlapClassificationFromWeightedScore(sim.similarity),
    clearanceImplied: false,
    note:
      risk === 'LOW_OVERLAP'
        ? 'LOW_OVERLAP is evidence only — NOT copyright clearance. Human rights decision still required.'
        : risk === 'HIGH_SOURCE_OVERLAP'
          ? 'HIGH_SOURCE_OVERLAP evidence for human review — rights fields not auto-mutated; existing editorial_blocker policy unchanged. Classification uses final weighted score only (not 3-gram alone; max shared run is EVIDENCE_ONLY).'
          : 'MEDIUM_OVERLAP evidence for human review — not an automatic rejection. Classification uses final weighted score only.',
  }
}

/** Pure classifier helper for tests (no network/DB). */
export function classifyOverlapFromTexts(
  canonicalText: string,
  sourceText: string
): Pick<
  CanonicalSourceOverlapAudit,
  | 'evaluated'
  | 'risk'
  | 'gateOverlapCategory'
  | 'similarity'
  | 'jaccard'
  | 'ngram3'
  | 'tokenMatchRatio'
  | 'maxSharedContiguousRun'
  | 'classificationReason'
  | 'clearanceImplied'
  | 'aiInvolved'
> {
  const sim = checkTextSimilarity(canonicalText, sourceText)
  return {
    evaluated: true,
    aiInvolved: false,
    risk: mapRisk(sim.overlapCategory),
    gateOverlapCategory: sim.overlapCategory,
    similarity: sim.similarity,
    jaccard: sim.jaccard,
    ngram3: sim.ngram3,
    tokenMatchRatio: sim.tokenMatchRatio,
    maxSharedContiguousRun: sim.maxSharedContiguousRun,
    classificationReason: explainOverlapClassificationFromWeightedScore(sim.similarity),
    clearanceImplied: false,
  }
}
