/**
 * P18.4D.8 — Authenticated PG canonical news publish (single explicit action).
 * Reuses rights gate + trusted editorial actor checks. Never auto-publishes.
 */

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import {
  assertTrustedEditorialHumanActor,
  evaluateCanonicalDraftPublishGate,
  type CanonicalPublishGateResult,
} from '@/services/editorial/newsRightsDecision'

export type CanonicalPublishResult =
  | {
      ok: true
      alreadyPublished: false
      id: string
      status: 'published'
      publishedAt: string
      publishedByPresent: true
      legacyFirestoreId: string | null
      rightsStatus: string | null
      rightsBasis: string | null
      gate: CanonicalPublishGateResult
    }
  | {
      ok: true
      alreadyPublished: true
      id: string
      status: 'published'
      publishedAt: string | null
      publishedByPresent: boolean
      legacyFirestoreId: string | null
      rightsStatus: string | null
      rightsBasis: string | null
      gate: CanonicalPublishGateResult
    }

export class CanonicalPublishError extends Error {
  readonly code: string
  readonly blockers: string[]
  constructor(code: string, blockers: string[] = []) {
    super(blockers.length ? `${code}:${blockers.join(',')}` : code)
    this.code = code
    this.blockers = blockers
  }
}

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

/** Extra server-side checks beyond the rights foundation gate (pilot + durable provenance). */
export function evaluateCanonicalPublishEligibility(row: {
  status: string
  publicationAuthority?: string | null
  rightsStatus?: string | null
  rightsBasis?: string | null
  rightsDecidedBy?: string | null
  rightsDecidedAt?: Date | string | null
  editorialBlocker?: string | null
  slug?: string | null
  title?: string | null
  content?: string | null
  source?: string | null
  sourceUrl?: string | null
}): CanonicalPublishGateResult {
  const base = evaluateCanonicalDraftPublishGate(row)
  const blockers = [...base.blockers]

  if ((row.publicationAuthority || '').toUpperCase() !== 'HUMAN_EDITOR') {
    blockers.push(`publication_authority_not_human_editor:${row.publicationAuthority || 'null'}`)
  }
  if (!row.rightsDecidedBy?.trim()) blockers.push('rights_decided_by_missing')
  if (!row.rightsDecidedAt) blockers.push('rights_decided_at_missing')
  if (!row.source?.trim()) blockers.push('source_field_missing')

  // Banned/quarantine: only draft may publish; banned already blocked by status_not_draft.
  if (row.status === 'banned') blockers.push('status_banned')

  return {
    publishable: blockers.length === 0 && (row.rightsStatus || '').toUpperCase() === 'CLEARED',
    blockers,
    rightsStatus: base.rightsStatus,
    rightsBasis: base.rightsBasis,
    editorialBlocker: base.editorialBlocker,
    executePublish: false, // intentional publish is a separate authenticated call
  }
}

/**
 * Publish a PG canonical draft. Actor MUST be the authenticated CMS UID
 * (never taken from client body). Reloads row and re-evaluates gates server-side.
 */
export async function publishCanonicalNews(input: {
  newsId: string
  actorUid: string
}): Promise<CanonicalPublishResult> {
  const actorUid = input.actorUid.trim()
  if (!actorUid) throw new CanonicalPublishError('publish_actor_missing')

  // Publishing actor: exact trusted editorial human (same P18.4C/D rule).
  await assertTrustedEditorialHumanActor(actorUid)

  const db = requireDb()
  const id = input.newsId.trim()
  if (!id) throw new CanonicalPublishError('news_id_missing')

  const rows = await db
    .select({
      id: news.id,
      status: news.status,
      slug: news.slug,
      title: news.title,
      content: news.content,
      source: news.source,
      sourceUrl: news.sourceUrl,
      publicationAuthority: news.publicationAuthority,
      rightsStatus: news.rightsStatus,
      rightsBasis: news.rightsBasis,
      rightsDecidedBy: news.rightsDecidedBy,
      rightsDecidedAt: news.rightsDecidedAt,
      editorialBlocker: news.editorialBlocker,
      publishedAt: news.publishedAt,
      publishedBy: news.publishedBy,
      legacyFirestoreId: news.legacyFirestoreId,
      migrationBatchId: news.migrationBatchId,
    })
    .from(news)
    .where(eq(news.id, id))
    .limit(1)

  const row = rows[0]
  if (!row) throw new CanonicalPublishError('news_not_found')

  const gateSnapshot = evaluateCanonicalPublishEligibility(row)

  if (row.status === 'published') {
    return {
      ok: true,
      alreadyPublished: true,
      id: row.id,
      status: 'published',
      publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
      publishedByPresent: Boolean(row.publishedBy),
      legacyFirestoreId: row.legacyFirestoreId,
      rightsStatus: row.rightsStatus,
      rightsBasis: row.rightsBasis,
      gate: gateSnapshot,
    }
  }

  if (!gateSnapshot.publishable) {
    throw new CanonicalPublishError('publish_gate_rejected', gateSnapshot.blockers)
  }

  // Rights decision actor must also be a trusted human (exact UID).
  await assertTrustedEditorialHumanActor(row.rightsDecidedBy!)

  const now = new Date()
  const updated = await db
    .update(news)
    .set({
      status: 'published',
      publishedAt: now,
      publishedBy: actorUid,
      updatedAt: now,
    })
    .where(and(eq(news.id, row.id), eq(news.status, 'draft')))
    .returning({
      id: news.id,
      status: news.status,
      publishedAt: news.publishedAt,
      publishedBy: news.publishedBy,
      legacyFirestoreId: news.legacyFirestoreId,
      rightsStatus: news.rightsStatus,
      rightsBasis: news.rightsBasis,
      slug: news.slug,
      title: news.title,
      content: news.content,
      migrationBatchId: news.migrationBatchId,
      publicationAuthority: news.publicationAuthority,
      rightsDecidedBy: news.rightsDecidedBy,
      rightsDecidedAt: news.rightsDecidedAt,
    })

  if (!updated.length) {
    // Race: another request published first.
    const again = await db
      .select({
        id: news.id,
        status: news.status,
        publishedAt: news.publishedAt,
        publishedBy: news.publishedBy,
        legacyFirestoreId: news.legacyFirestoreId,
        rightsStatus: news.rightsStatus,
        rightsBasis: news.rightsBasis,
      })
      .from(news)
      .where(eq(news.id, row.id))
      .limit(1)
    const cur = again[0]
    if (cur?.status === 'published') {
      return {
        ok: true,
        alreadyPublished: true,
        id: cur.id,
        status: 'published',
        publishedAt: cur.publishedAt ? new Date(cur.publishedAt).toISOString() : null,
        publishedByPresent: Boolean(cur.publishedBy),
        legacyFirestoreId: cur.legacyFirestoreId,
        rightsStatus: cur.rightsStatus,
        rightsBasis: cur.rightsBasis,
        gate: gateSnapshot,
      }
    }
    throw new CanonicalPublishError('publish_race_lost', ['conditional_update_zero_rows'])
  }

  const pub = updated[0]!
  // Content / identity / rights must be unchanged by the publish write.
  if (pub.id !== row.id) throw new CanonicalPublishError('identity_mutated')
  if (pub.legacyFirestoreId !== row.legacyFirestoreId) {
    throw new CanonicalPublishError('legacy_id_mutated')
  }
  if (pub.slug !== row.slug || pub.title !== row.title || pub.content !== row.content) {
    throw new CanonicalPublishError('content_mutated_on_publish')
  }
  if (pub.rightsStatus !== row.rightsStatus || pub.rightsBasis !== row.rightsBasis) {
    throw new CanonicalPublishError('rights_mutated_on_publish')
  }
  if (pub.rightsDecidedBy !== row.rightsDecidedBy) {
    throw new CanonicalPublishError('rights_actor_mutated_on_publish')
  }
  if (pub.publicationAuthority !== row.publicationAuthority) {
    throw new CanonicalPublishError('authority_mutated_on_publish')
  }
  if (pub.migrationBatchId !== row.migrationBatchId) {
    throw new CanonicalPublishError('migration_batch_mutated_on_publish')
  }

  console.info('[canonical-publish]', {
    id: pub.id,
    actorPresent: true,
    alreadyPublished: false,
    rightsStatus: pub.rightsStatus,
  })

  return {
    ok: true,
    alreadyPublished: false,
    id: pub.id,
    status: 'published',
    publishedAt: pub.publishedAt ? new Date(pub.publishedAt).toISOString() : now.toISOString(),
    publishedByPresent: true,
    legacyFirestoreId: pub.legacyFirestoreId,
    rightsStatus: pub.rightsStatus,
    rightsBasis: pub.rightsBasis,
    gate: gateSnapshot,
  }
}
