/**
 * P16.1 — Append-only audit trail for canonical PG rights/promotion decisions.
 *
 * Reuses the EXISTING `crawler_editorial_audit` table (entityType='canonical_news')
 * rather than creating a new table. That table already backs
 * `/api/admin/editorial-audit/log` for other editorial actions, so this is an
 * additive consumer of established, reviewed storage — not a parallel subsystem.
 *
 * NEVER persists raw source-body text or raw canonical body text — only small
 * scalar fields (scores, char counts, status strings, urls, timestamps).
 *
 * Design note (why this is not wrapped in a DB transaction with the caller's
 * primary mutation): the project's Postgres client is `drizzle-orm/neon-http`
 * (see src/db/index.ts), which has no interactive multi-statement transaction
 * support. Because of that, no existing service in this codebase uses
 * `db.transaction()` — this module follows the same constraint. The audit
 * write therefore happens as a best-effort *second* step after the primary
 * state mutation has already committed. On audit-write failure we do NOT
 * roll back or fail the primary action (the state change already happened
 * and is the source of truth); we surface the failure loudly instead
 * (console.error + `auditWriteFailed: true` on the caller's result) so an
 * operator can notice and reconcile, rather than silently swallowing it the
 * way the older fire-and-forget `/api/admin/editorial-audit/log` route does.
 */

import 'server-only'

import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { crawlerEditorialAudit } from '@/db/schema/crawler'

/** Distinct entityType value for canonical PG news rights/promotion events. */
export const CANONICAL_RIGHTS_AUDIT_ENTITY_TYPE = 'canonical_news' as const

export const CANONICAL_RIGHTS_AUDIT_ACTIONS = [
  'RIGHTS_PENDING',
  'RIGHTS_CLEARED',
  'RIGHTS_REWRITE_REQUIRED',
  'RIGHTS_DO_NOT_PUBLISH',
  'BLOCKER_SET',
  'BLOCKER_CLEARED',
  'PUBLISHED',
  'REVOKED',
] as const

export type CanonicalRightsAuditAction = (typeof CANONICAL_RIGHTS_AUDIT_ACTIONS)[number]

export interface CanonicalRightsAuditEventInput {
  newsId: string
  /** Server-resolved actor UID only — never client-supplied. */
  actorUid: string
  actorEmail?: string | null
  actorRole?: string | null
  action: CanonicalRightsAuditAction
  previousState?: string | null
  newState?: string | null
  reason?: string | null
  /**
   * Small structured snapshot (e.g. source-overlap evidence: similarity
   * scores, char counts, fetch status, algorithm/version, evaluability).
   * Must NEVER include raw source or canonical body text.
   */
  snapshot?: Record<string, unknown> | null
}

export interface CanonicalRightsAuditEventRecord {
  id: string
  newsId: string
  actorUid: string
  actorEmail: string | null
  actorRole: string
  action: string
  previousState: string | null
  newState: string | null
  reason: string | null
  snapshot: Record<string, unknown> | null
  createdAt: Date
}

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

/**
 * Keys that must never appear in a persisted snapshot even if a caller
 * accidentally includes them — defense-in-depth against raw body leakage.
 */
const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  'body',
  'html',
  'content',
  'htmlContent',
  'sourceBody',
  'sourceHtml',
  'canonicalBody',
  'articleBodyText',
])

const MAX_SNAPSHOT_STRING_FIELD = 500
const MAX_NOTE_CHARS = 3000

/** Strip anything that looks like raw article text before persisting. */
export function sanitizeCanonicalAuditSnapshot(
  snapshot: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!snapshot) return null
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(snapshot)) {
    if (FORBIDDEN_SNAPSHOT_KEYS.has(key)) continue
    if (typeof value === 'string' && value.length > MAX_SNAPSHOT_STRING_FIELD) continue
    if (value === undefined) continue
    clean[key] = value
  }
  return clean
}

function snapshotToNote(snapshot: Record<string, unknown> | null | undefined): string | null {
  const clean = sanitizeCanonicalAuditSnapshot(snapshot)
  if (!clean || Object.keys(clean).length === 0) return null
  const json = JSON.stringify(clean)
  return json.length > MAX_NOTE_CHARS ? json.slice(0, MAX_NOTE_CHARS) : json
}

function parseNote(note: string | null): Record<string, unknown> | null {
  if (!note) return null
  try {
    const parsed = JSON.parse(note)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Write one append-only audit event for a canonical rights/promotion action.
 * Never mutates `news`. Never deletes/updates prior audit rows (append-only).
 */
export async function recordCanonicalRightsAuditEvent(
  input: CanonicalRightsAuditEventInput
): Promise<{ id: string }> {
  const db = requireDb()
  const newsId = input.newsId.trim()
  const actorUid = input.actorUid.trim()
  if (!newsId) throw new Error('canonical_rights_audit_news_id_missing')
  if (!actorUid) throw new Error('canonical_rights_audit_actor_missing')

  const id = `cra_${randomUUID().replace(/-/g, '')}`
  await db.insert(crawlerEditorialAudit).values({
    id,
    actorId: actorUid,
    actorEmail: input.actorEmail?.trim() || null,
    actorRole: input.actorRole?.trim() || 'unknown_role',
    action: input.action,
    entityType: CANONICAL_RIGHTS_AUDIT_ENTITY_TYPE,
    entityId: newsId,
    affectedCount: 1,
    skippedCount: 0,
    failedCount: 0,
    reason: input.reason?.slice(0, 80) ?? null,
    note: snapshotToNote(input.snapshot),
    previousState: input.previousState?.slice(0, 40) ?? null,
    newState: input.newState?.slice(0, 40) ?? null,
  })
  return { id }
}

/**
 * Best-effort wrapper: never throws. Use this from primary-mutation service
 * functions so an audit-write failure never rolls back or masks a state
 * change that already committed. Returns whether the write succeeded.
 */
export async function recordCanonicalRightsAuditEventSafe(
  input: CanonicalRightsAuditEventInput
): Promise<{ ok: boolean; id: string | null; error: string | null }> {
  try {
    const { id } = await recordCanonicalRightsAuditEvent(input)
    return { ok: true, id, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'canonical_rights_audit_write_failed'
    console.error('[canonical-rights-audit] write failed', {
      newsId: input.newsId,
      action: input.action,
      error: message,
    })
    return { ok: false, id: null, error: message }
  }
}

/** Read-only: list append-only audit events for one canonical news row, newest first. */
export async function listCanonicalRightsAuditEvents(
  newsId: string,
  limit = 50
): Promise<CanonicalRightsAuditEventRecord[]> {
  const db = requireDb()
  const rows = await db
    .select()
    .from(crawlerEditorialAudit)
    .where(
      and(
        eq(crawlerEditorialAudit.entityType, CANONICAL_RIGHTS_AUDIT_ENTITY_TYPE),
        eq(crawlerEditorialAudit.entityId, newsId.trim())
      )
    )
    .orderBy(desc(crawlerEditorialAudit.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    newsId: row.entityId ?? newsId,
    actorUid: row.actorId,
    actorEmail: row.actorEmail ?? null,
    actorRole: row.actorRole,
    action: row.action,
    previousState: row.previousState ?? null,
    newState: row.newState ?? null,
    reason: row.reason ?? null,
    snapshot: parseNote(row.note ?? null),
    createdAt: row.createdAt,
  }))
}
