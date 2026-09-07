/**
 * P16.1 Task 4 -- Canonical PG news revoke / unpublish (single explicit action).
 *
 * Mirrors canonicalNewsPublish.ts's pattern: actor verification, race-safe
 * conditional UPDATE, post-write integrity checks, idempotent retries. This
 * is the inverse of publish -- published -> draft -- reusing the EXISTING
 * 'draft' status rather than inventing a new status value.
 *
 * Deliberate difference from publish's actor check: publishCanonicalNews
 * re-verifies the ORIGINAL rights-decision actor (row.rightsDecidedBy) in
 * addition to the publishing actor, because every row it can reach is
 * guaranteed (by its own gate) to have a non-null rightsDecidedBy. Revoke
 * has no such guarantee -- a row can reach 'published' status via the
 * separate forward crawler->cluster->editorial-draft->review pipeline
 * (src/services/editorial/editorialSupplyService.ts ->
 * src/services/publisher/newsMirrorRepository.ts), which writes
 * status='published' directly and leaves rightsDecidedBy NULL (that
 * pipeline has its own, separate human-approval gate that never touches the
 * rightsStatus/rightsDecidedBy columns). Re-verifying a null rightsDecidedBy
 * would crash on every such row, so revoke intentionally verifies ONLY the
 * revoking actor -- exactly the same trust bar publish uses for ITS acting
 * actor, so revoke is not easier to trigger than publish, just scoped to
 * fewer identity fields (there is one less to double check because one may
 * legitimately not exist).
 *
 * What is preserved (never touched) by a revoke: legacyFirestoreId,
 * migrationBatchId, migratedAt, content/htmlContent/slug/title,
 * rightsStatus/rightsBasis/rightsDecidedBy/rightsDecidedAt,
 * publicationAuthority, and the ORIGINAL publishedAt/publishedBy (kept as
 * historical provenance -- "this row was published at X by Y, then
 * revoked" remains reconstructable). Only `status` and `updatedAt` change.
 * A revoked row therefore keeps whatever rightsStatus it had (often
 * CLEARED), so it may become publish-eligible again via the existing
 * publish action -- that is intentional: revoke is a reversible pause, not
 * a destructive action, and a fresh human publish decision is still a
 * separate authenticated call.
 */

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { assertTrustedEditorialHumanActor } from '@/services/editorial/newsRightsDecision'
import { recordCanonicalRightsAuditEventSafe } from '@/services/editorial/canonicalRightsAudit'

export type CanonicalRevokeResult =
  | {
      ok: true
      alreadyUnpublished: false
      id: string
      status: 'draft'
      previousStatus: 'published'
      legacyFirestoreId: string | null
      rightsStatus: string | null
      rightsBasis: string | null
      /**
       * P16.1 Task 5 -- true when this row has a legacyFirestoreId, meaning a
       * matching Firestore `news` document (same slug, verbatim-copied by the
       * migration pipeline) most likely still exists and is most likely still
       * independently published there. This action NEVER reads or writes
       * Firestore, so this is a deterministic, code-level warning, not a live
       * check. When true: /haber/[slug] can silently keep serving the
       * Firestore copy after this revoke (see newsService.server.ts
       * getNewsBySlug's documented PG-first-then-Firestore-fallback order).
       * Revoking the PG row alone does NOT guarantee the article is fully
       * offline for rows with a legacyFirestoreId -- verify the Firestore
       * document's own status manually before treating this as a full
       * takedown.
       */
      firestoreFallbackRisk: boolean
    }
  | {
      ok: true
      alreadyUnpublished: true
      id: string
      status: 'draft'
      previousStatus: string
      legacyFirestoreId: string | null
      rightsStatus: string | null
      rightsBasis: string | null
      firestoreFallbackRisk: boolean
    }

export class CanonicalRevokeError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

/**
 * Revoke (unpublish) a published PG canonical news row: published -> draft.
 * Actor MUST be the authenticated CMS UID (never taken from client body).
 * Idempotent: revoking an already-draft row returns alreadyUnpublished:true
 * rather than erroring. Race-safe via a conditional UPDATE.
 */
export async function revokeCanonicalNews(input: {
  newsId: string
  actorUid: string
  actorEmail?: string | null
  actorRole?: string | null
  /** Optional human-supplied reason, persisted only in the audit event. */
  reason?: string | null
}): Promise<CanonicalRevokeResult> {
  const actorUid = input.actorUid.trim()
  if (!actorUid) throw new CanonicalRevokeError('revoke_actor_missing')

  // Revoking actor must be an exact trusted editorial human -- same bar as publish.
  await assertTrustedEditorialHumanActor(actorUid)

  const db = requireDb()
  const id = input.newsId.trim()
  if (!id) throw new CanonicalRevokeError('news_id_missing')

  const rows = await db
    .select({
      id: news.id,
      status: news.status,
      slug: news.slug,
      title: news.title,
      content: news.content,
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
  if (!row) throw new CanonicalRevokeError('news_not_found')

  const firestoreFallbackRisk = Boolean(row.legacyFirestoreId)

  if (row.status === 'draft') {
    return {
      ok: true,
      alreadyUnpublished: true,
      id: row.id,
      status: 'draft',
      previousStatus: row.status,
      legacyFirestoreId: row.legacyFirestoreId,
      rightsStatus: row.rightsStatus,
      rightsBasis: row.rightsBasis,
      firestoreFallbackRisk,
    }
  }

  if (row.status !== 'published') {
    throw new CanonicalRevokeError(`revoke_not_applicable_from_status:${row.status}`)
  }

  const now = new Date()
  const updated = await db
    .update(news)
    .set({
      status: 'draft',
      updatedAt: now,
    })
    .where(and(eq(news.id, row.id), eq(news.status, 'published')))
    .returning({
      id: news.id,
      status: news.status,
      slug: news.slug,
      title: news.title,
      content: news.content,
      publicationAuthority: news.publicationAuthority,
      rightsStatus: news.rightsStatus,
      rightsBasis: news.rightsBasis,
      rightsDecidedBy: news.rightsDecidedBy,
      rightsDecidedAt: news.rightsDecidedAt,
      publishedAt: news.publishedAt,
      publishedBy: news.publishedBy,
      legacyFirestoreId: news.legacyFirestoreId,
      migrationBatchId: news.migrationBatchId,
    })

  if (!updated.length) {
    // Race: another request changed status first (published or revoked already).
    const again = await db
      .select({
        id: news.id,
        status: news.status,
        legacyFirestoreId: news.legacyFirestoreId,
        rightsStatus: news.rightsStatus,
        rightsBasis: news.rightsBasis,
      })
      .from(news)
      .where(eq(news.id, row.id))
      .limit(1)
    const cur = again[0]
    if (cur?.status === 'draft') {
      return {
        ok: true,
        alreadyUnpublished: true,
        id: cur.id,
        status: 'draft',
        previousStatus: 'published',
        legacyFirestoreId: cur.legacyFirestoreId,
        rightsStatus: cur.rightsStatus,
        rightsBasis: cur.rightsBasis,
        firestoreFallbackRisk: Boolean(cur.legacyFirestoreId),
      }
    }
    throw new CanonicalRevokeError('revoke_race_lost')
  }

  const rev = updated[0]!

  // Post-write integrity: everything except status/updatedAt must be byte-identical.
  if (rev.id !== row.id) throw new CanonicalRevokeError('identity_mutated_on_revoke')
  if (rev.legacyFirestoreId !== row.legacyFirestoreId) {
    throw new CanonicalRevokeError('legacy_id_mutated_on_revoke')
  }
  if (rev.migrationBatchId !== row.migrationBatchId) {
    throw new CanonicalRevokeError('migration_batch_mutated_on_revoke')
  }
  if (rev.slug !== row.slug || rev.title !== row.title || rev.content !== row.content) {
    throw new CanonicalRevokeError('content_mutated_on_revoke')
  }
  if (rev.rightsStatus !== row.rightsStatus || rev.rightsBasis !== row.rightsBasis) {
    throw new CanonicalRevokeError('rights_mutated_on_revoke')
  }
  if (rev.rightsDecidedBy !== row.rightsDecidedBy) {
    throw new CanonicalRevokeError('rights_actor_mutated_on_revoke')
  }
  if (rev.publicationAuthority !== row.publicationAuthority) {
    throw new CanonicalRevokeError('authority_mutated_on_revoke')
  }
  const prevPublishedAtIso = row.publishedAt ? new Date(row.publishedAt).toISOString() : null
  const revPublishedAtIso = rev.publishedAt ? new Date(rev.publishedAt).toISOString() : null
  if (prevPublishedAtIso !== revPublishedAtIso || rev.publishedBy !== row.publishedBy) {
    throw new CanonicalRevokeError('publication_provenance_mutated_on_revoke')
  }

  console.info('[canonical-revoke]', {
    id: rev.id,
    actorPresent: true,
    firestoreFallbackRisk,
  })

  await recordCanonicalRightsAuditEventSafe({
    newsId: rev.id,
    actorUid,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    action: 'REVOKED',
    previousState: 'published',
    newState: 'draft',
    reason: input.reason,
    snapshot: {
      firestoreFallbackRisk,
      legacyFirestoreId: rev.legacyFirestoreId,
      rightsStatus: rev.rightsStatus,
      rightsBasis: rev.rightsBasis,
    },
  })

  return {
    ok: true,
    alreadyUnpublished: false,
    id: rev.id,
    status: 'draft',
    previousStatus: 'published',
    legacyFirestoreId: rev.legacyFirestoreId,
    rightsStatus: rev.rightsStatus,
    rightsBasis: rev.rightsBasis,
    firestoreFallbackRisk,
  }
}
