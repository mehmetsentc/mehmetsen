/**
 * Faz A3 — Editorial Memory Manual Shadow Sandbox V1.
 * Shared types for the read-only historical retrieval service.
 *
 * IMPORTANT (A2/A2.1 lineage):
 * - This is NOT the crawler event-clustering system. `eventKey` /
 *   `buildEventFingerprint` are NOT used to control retrieval here.
 * - No AI provider is called anywhere in this module tree.
 * - V1 source is PostgreSQL canonical `news` rows ONLY (see
 *   editorialMemoryEligibility — publicReadPolicy.ts).
 */

/** Deterministic evidence a candidate matched on — never an identity claim. */
export type MemoryEvidenceTag =
  | 'SHARED_NAMED_TOKEN'
  | 'SHARED_GEO'
  | 'SHARED_TOPIC_TOKEN'
  | 'TITLE_OVERLAP'
  | 'SUMMARY_OVERLAP'
  | 'SHARED_NUMBER'
  | 'RECENT_CLUSTER_MATCH' // optional/diagnostic only — never required, never controls retrieval

export interface MemoryEvidence {
  tag: MemoryEvidenceTag
  /** Short, human-readable explanation shown in the admin UI ("Neden eşleşti?"). */
  labelTr: string
  /** Raw signal strength, 0-1, for debugging only — never shown as the primary UI element. */
  weight: number
}

/**
 * Conservative relationship labels. A3 NEVER outputs SAME_EVENT or
 * VERIFIED_FACT — this phase is historical-context discovery, not claim
 * verification (A2.1 Task 8-9 carried forward verbatim).
 */
export type RelationshipConfidence = 'LIKELY_RELATED' | 'POSSIBLY_RELATED' | 'UNRESOLVED'

export type MemoryAgeBucket =
  | '2-7d'
  | '8-30d'
  | '1-3mo'
  | '3-12mo'
  | '12mo+'

/** The current article a retrieval is being run for. */
export interface HistoricalRetrievalInput {
  /** Canonical PG id, if the current article already has one. Used for self-exclusion. */
  articleId?: string | null
  slug?: string | null
  headline: string
  summary?: string | null
  categoryId?: string | null
  citySlug?: string | null
  districtSlug?: string | null
  /** ISO timestamp of the current article. Candidates published after this are excluded (Task 6). */
  publishedAt?: string | null
}

/** Editor context narrows Stage A candidate retrieval (not required). */
export interface HistoricalRetrievalEditorContext {
  editorId?: string | null
  managedCategories?: string[]
  citySlug?: string | null
}

/**
 * A single retrieved historical NaHaber article, presented as CONTEXT —
 * never as a verified fact (A2.1 Task 9 naming decision, carried forward).
 */
export interface HistoricalArticleContext {
  articleId: string
  slug: string
  headline: string
  publishedAt: string
  summary: string | null
  category: string | null
  geography: { citySlug: string | null; districtSlug: string | null } | null
  /** A3 invariant: always 'CANONICAL' — see editorialMemoryEligibility. */
  publicReadClass: 'CANONICAL'
  /** A3 invariant: always 'HIGH' because publicReadClass is always CANONICAL. */
  trustTier: 'HIGH'
  source: string | null
  ageBucket: MemoryAgeBucket
  /** Internal ranking score — secondary/debug info in the UI (Task 14). */
  retrievalScore: number
  evidence: MemoryEvidence[]
  relationshipConfidence: RelationshipConfidence
}

export interface HistoricalRetrievalResult {
  results: HistoricalArticleContext[]
  /** Set when results is empty, so the UI can show a specific reason (Task 15). */
  noResultReason?:
    | 'NO_DATABASE_URL'
    | 'NO_CANONICAL_CANDIDATES'
    | 'NO_CANDIDATES_PASSED_SAFETY_FILTER'
    | 'QUERY_ERROR'
  /** Diagnostic only — never surfaced as a claim of certainty. */
  candidatesConsideredByBucket?: Record<MemoryAgeBucket, number>
}

export interface CanonicalMemoryCoverageStats {
  hasDatabaseUrl: boolean
  total: number
  oldestPublishedAt: string | null
  newestPublishedAt: string | null
  last7d: number
  last30d: number
  last90d: number
  last365d: number
  olderThan365d: number
  topCities: { citySlug: string; count: number }[]
  topCategories: { categoryId: string; count: number }[]
  queryError?: string
}
