/**
 * P18.4D.2 — Canonical PG news rights decision + publish gate.
 * Independent of publication_authority. Exact trusted editorial UID only.
 */

import 'server-only'

import { eq } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { users } from '@/db/schema/users'
import {
  TRUSTED_EDITORIAL_ROLES,
} from '@/services/editorial/canonicalMigrationEligibility'
import { loadTrustedEditorialActorUids } from '@/services/editorial/trustedEditorialActors'
import { isAutomationIdentity } from '@/services/editorial/humanReviewGate'
import { isExactKnownAutomationUid } from '@/services/editorial/publicationAuthority'

export const NEWS_RIGHTS_STATUSES = [
  'PENDING',
  'CLEARED',
  'REWRITE_REQUIRED',
  'DO_NOT_PUBLISH',
] as const

export type NewsRightsStatus = (typeof NEWS_RIGHTS_STATUSES)[number]

export const NEWS_RIGHTS_BASES = [
  'UNKNOWN',
  'PUBLISHER_ORIGINAL',
  'SOURCE_ASSOCIATED',
  'LICENSED',
  'OWNED',
  'OFFICIAL_RELEASE',
  'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
  'HUMAN_REVIEWED_OTHER',
] as const

export type NewsRightsBasis = (typeof NEWS_RIGHTS_BASES)[number]

export type CanonicalPublishGateResult = {
  publishable: boolean
  blockers: string[]
  rightsStatus: NewsRightsStatus | null
  rightsBasis: NewsRightsBasis | null
  editorialBlocker: string | null
  /** Gate may be green; this phase still forbids auto-publish. */
  executePublish: false
}

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

export function isNewsRightsStatus(v: unknown): v is NewsRightsStatus {
  return typeof v === 'string' && (NEWS_RIGHTS_STATUSES as readonly string[]).includes(v)
}

export function isNewsRightsBasis(v: unknown): v is NewsRightsBasis {
  return typeof v === 'string' && (NEWS_RIGHTS_BASES as readonly string[]).includes(v)
}

/** Exact trusted editorial human actor — same P18.4C rule. */
export async function assertTrustedEditorialHumanActor(uid: string): Promise<void> {
  const exact = uid.trim()
  if (!exact) throw new Error('rights_actor_missing')
  if (isExactKnownAutomationUid(exact) || isAutomationIdentity(exact)) {
    throw new Error('rights_actor_automation_rejected')
  }
  const trusted = await loadTrustedEditorialActorUids()
  if (!trusted.has(exact)) {
    // Double-check role via exact UID query (exact string only)
    const db = requireDb()
    const rows = await db
      .select({ uid: users.firebaseUid, role: users.role })
      .from(users)
      .where(eq(users.firebaseUid, exact))
      .limit(1)
    const role = rows[0]?.role
    if (!rows[0] || !(TRUSTED_EDITORIAL_ROLES as readonly string[]).includes(role)) {
      throw new Error('rights_actor_not_trusted_editorial')
    }
  }
}

/**
 * Record a reversible human rights decision on a PG news row.
 * Does NOT publish. Does NOT clear editorial_blocker automatically.
 */
export async function recordNewsRightsDecision(input: {
  newsId: string
  actorUid: string
  status: NewsRightsStatus
  basis: NewsRightsBasis
  /** If true, refuse CLEARED while editorial_blocker is set. */
  refuseClearWhenBlocked?: boolean
}): Promise<{ id: string; rightsStatus: NewsRightsStatus; rightsBasis: NewsRightsBasis }> {
  await assertTrustedEditorialHumanActor(input.actorUid)

  if (input.status === 'CLEARED' && (input.basis === 'UNKNOWN' || !input.basis)) {
    throw new Error('rights_basis_required_for_cleared')
  }

  const db = requireDb()
  const rows = await db
    .select({
      id: news.id,
      status: news.status,
      editorialBlocker: news.editorialBlocker,
    })
    .from(news)
    .where(eq(news.id, input.newsId.trim()))
    .limit(1)

  const row = rows[0]
  if (!row) throw new Error('news_not_found')
  if (row.status === 'published') throw new Error('refuse_rights_on_already_published_in_this_phase')

  if (
    input.status === 'CLEARED' &&
    (input.refuseClearWhenBlocked !== false) &&
    row.editorialBlocker
  ) {
    throw new Error(`rights_clear_blocked_by_editorial_blocker:${row.editorialBlocker}`)
  }

  const now = new Date()
  await db
    .update(news)
    .set({
      rightsStatus: input.status,
      rightsBasis: input.basis,
      rightsDecidedBy: input.actorUid.trim(),
      rightsDecidedAt: now,
      updatedAt: now,
    })
    .where(eq(news.id, row.id))

  return { id: row.id, rightsStatus: input.status, rightsBasis: input.basis }
}

/**
 * Evaluate whether a PG news draft would be allowed to publish.
 * Always returns executePublish: false in this foundation (kapıyı açma).
 */
export function evaluateCanonicalDraftPublishGate(row: {
  status: string
  rightsStatus?: string | null
  rightsBasis?: string | null
  editorialBlocker?: string | null
  slug?: string | null
  title?: string | null
  content?: string | null
  sourceUrl?: string | null
}): CanonicalPublishGateResult {
  const blockers: string[] = []
  const rightsStatus = (row.rightsStatus || 'PENDING').toUpperCase() as NewsRightsStatus
  const rightsBasis = (row.rightsBasis || 'UNKNOWN').toUpperCase() as NewsRightsBasis
  const editorialBlocker = row.editorialBlocker?.trim() || null

  if (row.status !== 'draft') blockers.push(`status_not_draft:${row.status}`)
  if (!row.slug?.trim()) blockers.push('slug_missing')
  if (!row.title?.trim()) blockers.push('title_missing')
  if (!(row.content || '').trim() || (row.content || '').trim().length < 120) {
    blockers.push('body_quality')
  }
  if (!row.sourceUrl?.trim()) blockers.push('source_url_missing')

  if (rightsStatus === 'PENDING') blockers.push('rights_pending')
  if (rightsStatus === 'REWRITE_REQUIRED') blockers.push('rights_rewrite_required')
  if (rightsStatus === 'DO_NOT_PUBLISH') blockers.push('rights_do_not_publish')
  if (rightsStatus === 'CLEARED' && (rightsBasis === 'UNKNOWN' || !rightsBasis)) {
    blockers.push('rights_basis_missing')
  }
  if (editorialBlocker) blockers.push(`editorial_blocker:${editorialBlocker}`)

  return {
    publishable: blockers.length === 0 && rightsStatus === 'CLEARED',
    blockers,
    rightsStatus,
    rightsBasis,
    editorialBlocker,
    executePublish: false,
  }
}

export async function getCanonicalNewsRightsReview(newsId: string) {
  const db = requireDb()
  const rows = await db
    .select({
      id: news.id,
      slug: news.slug,
      title: news.title,
      summary: news.summary,
      content: news.content,
      status: news.status,
      source: news.source,
      sourceUrl: news.sourceUrl,
      publicationAuthority: news.publicationAuthority,
      approvedBy: news.approvedBy,
      publishedBy: news.publishedBy,
      approvedAt: news.approvedAt,
      legacyFirestoreId: news.legacyFirestoreId,
      migrationBatchId: news.migrationBatchId,
      migratedAt: news.migratedAt,
      rightsStatus: news.rightsStatus,
      rightsBasis: news.rightsBasis,
      rightsDecidedBy: news.rightsDecidedBy,
      rightsDecidedAt: news.rightsDecidedAt,
      editorialBlocker: news.editorialBlocker,
      coverImageUrl: news.coverImageUrl,
    })
    .from(news)
    .where(eq(news.id, newsId.trim()))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const gate = evaluateCanonicalDraftPublishGate({
    status: row.status,
    rightsStatus: row.rightsStatus,
    rightsBasis: row.rightsBasis,
    editorialBlocker: row.editorialBlocker,
    slug: row.slug,
    title: row.title,
    content: row.content,
    sourceUrl: row.sourceUrl,
  })

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    content: row.content,
    status: row.status,
    source: row.source,
    sourceUrl: row.sourceUrl,
    publicationAuthority: row.publicationAuthority,
    approvedAt: row.approvedAt,
    legacyFirestoreId: row.legacyFirestoreId,
    migrationBatchId: row.migrationBatchId,
    migratedAt: row.migratedAt,
    rightsStatus: row.rightsStatus,
    rightsBasis: row.rightsBasis,
    rightsDecidedAt: row.rightsDecidedAt,
    editorialBlocker: row.editorialBlocker,
    coverImageUrl: row.coverImageUrl,
    hasApprovedBy: Boolean(row.approvedBy),
    hasPublishedBy: Boolean(row.publishedBy),
    hasRightsDecidedBy: Boolean(row.rightsDecidedBy),
    bodyLen: (row.content || '').length,
    gate,
    availableActions: row.editorialBlocker
      ? (['PENDING', 'REWRITE_REQUIRED', 'DO_NOT_PUBLISH'] as NewsRightsStatus[])
      : (['PENDING', 'CLEARED', 'REWRITE_REQUIRED', 'DO_NOT_PUBLISH'] as NewsRightsStatus[]),
    availableBases: NEWS_RIGHTS_BASES,
  }
}

/** Seed durable C2 rewrite blocker (not a human CLEAR). */
export async function seedCandidate2EditorialBlocker(): Promise<void> {
  const db = requireDb()
  const id = '0SdmPVCnO8pVAbMENA9f'
  await db
    .update(news)
    .set({
      rightsStatus: 'REWRITE_REQUIRED',
      rightsBasis: 'UNKNOWN',
      editorialBlocker: 'HIGH_SOURCE_OVERLAP',
      updatedAt: new Date(),
    })
    .where(eq(news.id, id))
}
