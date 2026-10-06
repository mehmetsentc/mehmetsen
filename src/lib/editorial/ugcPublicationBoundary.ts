/**
 * SEC-UGC-INTEGRITY-REPAIR-1 — reader-submitted (UGC) draft → canonical news boundary.
 *
 * Pure helpers (no Firestore I/O) shared by:
 *   - bulk approval paths (bulk-approve, flush-pending, draft-reprocess) → UGC excluded
 *   - newsDraftService.approveDraft (individual human approval) → UGC normalized
 *
 * UGC is only ever published through an explicit, per-item human review.
 * Untrusted UGC metadata can never drive placement (Featured/Breaking/Pinned/Trending),
 * staff/AI byline identity, or crawler provenance (rssGuid=raw_… → raw article state).
 */

/** Error code thrown when a bulk path reaches a UGC draft (defense in depth). */
export const UGC_REQUIRES_INDIVIDUAL_REVIEW = 'UGC_REQUIRES_INDIVIDUAL_REVIEW'

function normToken(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

/** A draft is UGC when either marker says so (same contract as /api/admin/submissions). */
export function isUgcDraft(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const d = data as { source?: unknown; type?: unknown }
  return normToken(d.source) === 'ugc' || normToken(d.type) === 'ugc'
}

/** Split bulk-approval candidates; UGC never enters an automatic/bulk approval run. */
export function partitionBulkApprovalCandidates<T>(
  items: readonly T[],
  getData: (item: T) => unknown
): { eligible: T[]; ugcExcluded: T[] } {
  const eligible: T[] = []
  const ugcExcluded: T[] = []
  for (const item of items) {
    if (isUgcDraft(getData(item))) ugcExcluded.push(item)
    else eligible.push(item)
  }
  return { eligible, ugcExcluded }
}

/**
 * Fields a UGC draft may never carry into canonical publication.
 * Placement, persona/staff byline extras, AI/editor attribution, crawler provenance,
 * and rights/source-text inputs that would steer the publication authority gate.
 */
export const UGC_UNTRUSTED_PUBLICATION_FIELDS = [
  // placement
  'featured',
  'isEditorPick',
  'featuredAt',
  'localFeatured',
  'localFeaturedAt',
  'isBreaking',
  'breakingScore',
  'priorityScore',
  'isPinned',
  'isTrending',
  'aiAutoPublished',
  'needsReview',
  // persona / staff identity extras (byline is re-derived separately)
  'author',
  'authorUsername',
  'authorDisplayName',
  'authorPhotoURL',
  'aiEditorId',
  'articleFormat',
  'editorId',
  'editorType',
  'confidenceScore',
  'factCheckFlags',
  // crawler / ingestion provenance
  'rssGuid',
  'rssFingerprint',
  'sourceUrl',
  'ingestionSourceId',
  'sourceLabel',
  'originalTitle',
  'ingestedAt',
  'sourcePublishedAt',
  // rights / source-text inputs to authorizePublication
  'rightsStatus',
  'rightsBasis',
  'originalContent',
  'sourceBodyText',
  'rawBodyText',
] as const

export interface UgcByline {
  author: string
  authorDisplayName: string
  authorUsername?: string
}

/**
 * Byline derived only from the submitting user's own profile (users/{authorId}),
 * never from draft fields. Missing profile → neutral reader byline, no /yazar link.
 */
export function buildUgcBylineFromUserDoc(user: unknown): UgcByline {
  const u = (user && typeof user === 'object' ? user : {}) as {
    username?: unknown
    displayName?: unknown
    name?: unknown
  }
  const username = typeof u.username === 'string' ? u.username.trim() : ''
  const displayName =
    (typeof u.displayName === 'string' && u.displayName.trim()) ||
    (typeof u.name === 'string' && u.name.trim()) ||
    username ||
    'Okur'
  return {
    author: username || displayName,
    authorDisplayName: displayName,
    ...(username ? { authorUsername: username } : {}),
  }
}

/**
 * Normalize a UGC draft for canonical publication: strip every untrusted field,
 * force reader provenance (source/type 'ugc', aiGenerated=false), apply the
 * profile-derived byline. Content fields (title/spot/body/media/category/geo) stay
 * — those are what the reviewing editor approves.
 */
export function normalizeUgcDraftForPublication<T extends Record<string, unknown>>(
  draft: T,
  byline: UgcByline
): T {
  const out: Record<string, unknown> = { ...draft }
  for (const key of UGC_UNTRUSTED_PUBLICATION_FIELDS) delete out[key]
  out.author = byline.author
  out.authorDisplayName = byline.authorDisplayName
  if (byline.authorUsername) out.authorUsername = byline.authorUsername
  out.source = 'ugc'
  out.type = 'ugc'
  out.aiGenerated = false
  out.isBreaking = false
  out.breakingScore = 0
  out.priorityScore = 0
  out.isPinned = false
  out.isTrending = false
  return out as T
}

/** Crawler raw-article state may only be driven by non-UGC drafts. */
export function crawlerRawArticleIdForPublication(draft: unknown): string | null {
  if (isUgcDraft(draft)) return null
  const raw = String((draft as { rssGuid?: unknown } | null)?.rssGuid ?? '').trim()
  return raw.startsWith('raw_') ? raw : null
}
