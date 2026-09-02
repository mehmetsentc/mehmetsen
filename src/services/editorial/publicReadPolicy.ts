/**
 * P18.3 — Public read classification (READ POLICY ONLY).
 *
 * Does not publish, unpublish, migrate, or mutate storage.
 * Every public consumer surface should prefer modern canonical inventory
 * while keeping staged legacy continuity where hard-cutting Firestore
 * would cause severe outage.
 */

import { isPlaceholderDraftSlug } from '@/lib/newsSlug'
import { isAutomationIdentity, KNOWN_AUTOMATION_UIDS } from './humanReviewGate'

export type PublicReadClass =
  | 'CANONICAL'
  | 'SYSTEM_ALERT'
  | 'LEGACY_ALLOWED'
  | 'LEGACY_QUARANTINED'
  | 'NOT_PUBLIC'

/**
 * Metadata available at read time from PG Post, Firestore doc, or NewsItem.
 * Do not infer HUMAN_EDITOR from authorId alone.
 */
export type PublicReadArticleMeta = {
  id?: string | null
  title?: string | null
  status?: string | null
  slug?: string | null
  visibility?: string | null
  publicationAuthority?: string | null
  publishedBy?: string | null
  approvedBy?: string | null
  authorId?: string | null
  aiAutoPublished?: boolean | null
  needsReview?: boolean | null
  needsAdminReview?: boolean | null
  seoNoindex?: boolean | null
  publisherType?: string | null
  /**
   * True when the article was resolved from PostgreSQL canonical published path.
   * PG published inventory is modern editorial supply (CANONICAL).
   */
  fromCanonicalPg?: boolean | null
}

const PUBLIC_READ_RANK: Record<PublicReadClass, number> = {
  CANONICAL: 0,
  SYSTEM_ALERT: 1,
  LEGACY_ALLOWED: 2,
  LEGACY_QUARANTINED: 3,
  NOT_PUBLIC: 4,
}

const NON_PUBLIC_STATUSES = new Set([
  'draft',
  'pending',
  'archived',
  'banned',
  'deleted',
  'private',
  'rejected',
])

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase()
}

function isPublishedStatus(status: string | null | undefined): boolean {
  const s = normalizeStatus(status)
  return s === 'published' || s === 'active'
}

function hasTestOrPrivateSignals(meta: PublicReadArticleMeta): boolean {
  if (meta.visibility === 'private') return true
  if (meta.seoNoindex === true) return true
  if (meta.publisherType === 'INTERNAL_TEST') return true
  const id = (meta.id ?? '').trim()
  if (id.startsWith('test_')) return true
  const title = (meta.title ?? '').trim()
  if (title.includes('[TEST]') || title.includes('[%TEST%]')) return true
  return false
}

function hasAutomationActorSignal(meta: PublicReadArticleMeta): boolean {
  const actors = [meta.publishedBy, meta.approvedBy, meta.authorId]
  for (const raw of actors) {
    if (typeof raw !== 'string') continue
    const uid = raw.trim()
    if (!uid) continue
    if (KNOWN_AUTOMATION_UIDS.has(uid)) return true
    if (isAutomationIdentity(uid)) return true
  }
  return false
}

function hasLegacyQuarantineSignals(meta: PublicReadArticleMeta): boolean {
  if (meta.aiAutoPublished === true) return true
  if (meta.needsReview === true || meta.needsAdminReview === true) return true
  if (hasTestOrPrivateSignals(meta)) return true
  if (hasAutomationActorSignal(meta)) return true
  if (isPlaceholderDraftSlug(meta.slug)) return true
  // Slug missing or collapsed to id-only — keep detail continuity, quarantine discovery.
  const slug = (meta.slug ?? '').trim()
  const id = (meta.id ?? '').trim()
  if (!slug) return true
  if (id && slug === id) return true
  return false
}

/**
 * Deterministic public read classification from article metadata only.
 * No AI. No storage writes.
 */
export function classifyPublicRead(meta: PublicReadArticleMeta): PublicReadClass {
  if (!isPublishedStatus(meta.status)) {
    return 'NOT_PUBLIC'
  }

  // Explicit modern authorities win when present (do not infer from authorId).
  const authority = (meta.publicationAuthority ?? '').trim().toUpperCase()
  if (authority === 'HUMAN_EDITOR') {
    return 'CANONICAL'
  }
  if (authority === 'SYSTEM_ALERT') {
    return 'SYSTEM_ALERT'
  }

  // PostgreSQL published canonical path is modern inventory.
  if (meta.fromCanonicalPg === true) {
    return 'CANONICAL'
  }

  // Historical Firestore published without modern authority.
  if (hasLegacyQuarantineSignals(meta)) {
    return 'LEGACY_QUARANTINED'
  }

  return 'LEGACY_ALLOWED'
}

export function publicReadClassRank(cls: PublicReadClass): number {
  return PUBLIC_READ_RANK[cls]
}

export function comparePublicReadPriority(
  a: PublicReadArticleMeta,
  b: PublicReadArticleMeta
): number {
  const ra = publicReadClassRank(classifyPublicRead(a))
  const rb = publicReadClassRank(classifyPublicRead(b))
  if (ra !== rb) return ra - rb
  return 0
}

/** Homepage /feed eligibility — never LEGACY_QUARANTINED / NOT_PUBLIC. */
export function canAppearInHomepage(cls: PublicReadClass): boolean {
  return cls === 'CANONICAL' || cls === 'SYSTEM_ALERT' || cls === 'LEGACY_ALLOWED'
}

/** Smart Feed /feed-v2 — quarantined never enters candidates. */
export function canAppearInSmartFeed(cls: PublicReadClass): boolean {
  return cls === 'CANONICAL' || cls === 'SYSTEM_ALERT' || cls === 'LEGACY_ALLOWED'
}

/** Search results — same discovery bar as homepage. */
export function canAppearInSearch(cls: PublicReadClass): boolean {
  return cls === 'CANONICAL' || cls === 'SYSTEM_ALERT' || cls === 'LEGACY_ALLOWED'
}

/**
 * Indexability for article detail robots.
 * LEGACY_ALLOWED keeps temporary indexability (staged SEO continuity).
 * LEGACY_QUARANTINED → noindex,follow containment.
 */
export function canBeIndexable(cls: PublicReadClass): boolean {
  return cls === 'CANONICAL' || cls === 'SYSTEM_ALERT' || cls === 'LEGACY_ALLOWED'
}

/** Google News sitemap — modern high-trust inventory only. */
export function canAppearInNewsSitemap(cls: PublicReadClass): boolean {
  return cls === 'CANONICAL' || cls === 'SYSTEM_ALERT'
}

/**
 * Image sitemap — exclude quarantined / not public; allow temporary LEGACY_ALLOWED.
 */
export function canAppearInImageSitemap(cls: PublicReadClass): boolean {
  return cls === 'CANONICAL' || cls === 'SYSTEM_ALERT' || cls === 'LEGACY_ALLOWED'
}

/** Video sitemap — same policy as image sitemap. */
export function canAppearInVideoSitemap(cls: PublicReadClass): boolean {
  return cls === 'CANONICAL' || cls === 'SYSTEM_ALERT' || cls === 'LEGACY_ALLOWED'
}

/**
 * Direct /haber/[slug] continuity.
 * Quarantined may remain readable temporarily (no mass-404).
 * NOT_PUBLIC is blocked.
 */
export function canResolveArticleDetail(cls: PublicReadClass): boolean {
  return (
    cls === 'CANONICAL' ||
    cls === 'SYSTEM_ALERT' ||
    cls === 'LEGACY_ALLOWED' ||
    cls === 'LEGACY_QUARANTINED'
  )
}

/** Robots for detail pages. Quarantined: noindex,follow (not nofollow). */
export function robotsForPublicReadClass(cls: PublicReadClass): {
  index: boolean
  follow: boolean
} {
  if (cls === 'NOT_PUBLIC') return { index: false, follow: false }
  if (cls === 'LEGACY_QUARANTINED') return { index: false, follow: true }
  return { index: canBeIndexable(cls), follow: true }
}

/**
 * Self-canonical is retained for quarantined pages with noindex.
 * Reasoning: omitting canonical or pointing to homepage creates loops / soft-404
 * signals; predictable noindex containment is safer for staged retirement.
 */
export function shouldEmitSelfCanonical(cls: PublicReadClass): boolean {
  return cls !== 'NOT_PUBLIC'
}

export type PublicReadClassCounts = Record<PublicReadClass, number>

export function emptyPublicReadClassCounts(): PublicReadClassCounts {
  return {
    CANONICAL: 0,
    SYSTEM_ALERT: 0,
    LEGACY_ALLOWED: 0,
    LEGACY_QUARANTINED: 0,
    NOT_PUBLIC: 0,
  }
}

export function tallyPublicReadClasses(
  metas: PublicReadArticleMeta[]
): PublicReadClassCounts {
  const counts = emptyPublicReadClassCounts()
  for (const meta of metas) {
    counts[classifyPublicRead(meta)] += 1
  }
  return counts
}

/**
 * Low-cost observability — one aggregated log line, no per-doc writes.
 */
export function logPublicReadClassCounts(
  surface: string,
  counts: PublicReadClassCounts,
  extra?: Record<string, unknown>
): void {
  console.info(
    '[publicReadPolicy]',
    surface,
    JSON.stringify({ ...counts, ...extra })
  )
}

/** Extract classifier input from a Firestore news document + id. */
export function publicReadMetaFromFirestoreDoc(
  id: string,
  data: Record<string, unknown>
): PublicReadArticleMeta {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : null,
    status: typeof data.status === 'string' ? data.status : null,
    slug: typeof data.slug === 'string' ? data.slug : null,
    visibility: typeof data.visibility === 'string' ? data.visibility : null,
    publicationAuthority:
      typeof data.publicationAuthority === 'string' ? data.publicationAuthority : null,
    publishedBy: typeof data.publishedBy === 'string' ? data.publishedBy : null,
    approvedBy: typeof data.approvedBy === 'string' ? data.approvedBy : null,
    authorId: typeof data.authorId === 'string' ? data.authorId : null,
    aiAutoPublished: data.aiAutoPublished === true,
    needsReview: data.needsReview === true,
    needsAdminReview: data.needsAdminReview === true,
    seoNoindex: data.seoNoindex === true,
    publisherType: typeof data.publisherType === 'string' ? data.publisherType : null,
    fromCanonicalPg: false,
  }
}

/** Extract classifier input from a mapped Post (optional fromCanonicalPg). */
export function publicReadMetaFromPost(
  post: PublicReadArticleMeta & { status?: string | null }
): PublicReadArticleMeta {
  return {
    id: post.id ?? null,
    title: post.title ?? null,
    status: post.status ?? null,
    slug: post.slug ?? null,
    visibility: post.visibility ?? null,
    publicationAuthority: post.publicationAuthority ?? null,
    publishedBy: post.publishedBy ?? null,
    approvedBy: post.approvedBy ?? null,
    authorId: post.authorId ?? null,
    aiAutoPublished: post.aiAutoPublished ?? null,
    needsReview: post.needsReview ?? null,
    needsAdminReview: post.needsAdminReview ?? null,
    seoNoindex: post.seoNoindex ?? null,
    publisherType: post.publisherType ?? null,
    fromCanonicalPg: post.fromCanonicalPg ?? null,
  }
}
