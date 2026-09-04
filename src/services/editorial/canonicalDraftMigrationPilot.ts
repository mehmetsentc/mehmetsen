/**
 * P18.4C / P18.4E — Canonical DRAFT migration write path.
 *
 * Hard constraints:
 * - MAX_PILOT_RECORDS = 5 (P18.4C); MAX_COHORT_RECORDS = 10 (P18.4E)
 * - status always = draft
 * - no Firestore mutation
 * - no social/seen remaps
 * - no cluster rewrite
 * - no public API / cron / worker
 * - never publishes
 */

import 'server-only'

import { and, count, eq, or, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { users } from '@/db/schema/users'
import { categories } from '@/db/schema/categories'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { loadTrustedEditorialActorUids } from '@/services/editorial/trustedEditorialActors'
import {
  classifyMigrationEligibility,
  migrationEvidenceFromFirestoreDoc,
  type MigrationEligibilityClass,
} from '@/services/editorial/canonicalMigrationEligibility'
import { planCanonicalMigrationDryRun } from '@/services/editorial/canonicalMigrationPlanner'

/** Absolute hard max for P18.4C pilot. Not configurable. */
export const MAX_PILOT_RECORDS = 5 as const

/** Absolute hard max for P18.4E bounded cohort #1. Not configurable. */
export const MAX_COHORT_RECORDS = 10 as const

export const P18_4C_BATCH_PREFIX = 'P18_4C_' as const
export const P18_4E_BATCH_PREFIX = 'P18_4E_' as const

export type PilotExecuteMode = 'dry-run' | 'execute'

export type PilotCandidateResult = {
  firestoreId: string
  mode: PilotExecuteMode
  outcome:
    | 'PLANNED'
    | 'INSERTED'
    | 'ALREADY_MIGRATED'
    | 'REFUSED'
    | 'STOPPED'
  migrationClass: MigrationEligibilityClass | null
  targetPgId: string | null
  status: string | null
  blockers: string[]
  migrationBatchId: string | null
  similarityState: 'SIMILARITY_NOT_EVALUATED'
}

export type PilotRunResult = {
  mode: PilotExecuteMode
  batchId: string
  hardMax: number
  requestedIds: string[]
  results: PilotCandidateResult[]
  insertedCount: number
  refusedCount: number
  alreadyMigratedCount: number
}

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

export { loadTrustedEditorialActorUids } from '@/services/editorial/trustedEditorialActors'

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function asDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (
    v &&
    typeof v === 'object' &&
    'toDate' in v &&
    typeof (v as { toDate: () => Date }).toDate === 'function'
  ) {
    const d = (v as { toDate: () => Date }).toDate()
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
  }
  return null
}

function buildBatchId(prefix: string, now: Date = new Date()): string {
  // Deterministic within the same UTC minute for ops readability; not a secret.
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  return `${prefix}${stamp}`
}

function assertHardIdList(ids: string[], hardMax: number): string[] {
  const cleaned = ids.map((id) => id.trim()).filter(Boolean)
  if (cleaned.length === 0) {
    throw new Error('canonical draft migration requires an explicit non-empty Firestore ID list')
  }
  if (cleaned.length > hardMax) {
    throw new Error(
      `canonical draft migration hard max exceeded: requested ${cleaned.length} > hardMax=${hardMax}`
    )
  }
  // Exact uniqueness — refuse silent de-dup that could hide operator error.
  const seen = new Set<string>()
  for (const id of cleaned) {
    if (seen.has(id)) throw new Error(`duplicate ID in migration list: ${id}`)
    seen.add(id)
  }
  return cleaned
}

/**
 * Migrate one FS news doc → PG draft candidate.
 * Idempotent: existing same id / legacy_firestore_id → ALREADY_MIGRATED.
 */
export async function migrateOneCanonicalDraftPilot(opts: {
  firestoreId: string
  mode: PilotExecuteMode
  batchId: string
  trustedEditorialActorUids: ReadonlySet<string>
}): Promise<PilotCandidateResult> {
  const firestoreId = opts.firestoreId.trim()
  const base: PilotCandidateResult = {
    firestoreId,
    mode: opts.mode,
    outcome: 'REFUSED',
    migrationClass: null,
    targetPgId: null,
    status: null,
    blockers: [],
    migrationBatchId: null,
    similarityState: 'SIMILARITY_NOT_EVALUATED',
  }

  const plan = await planCanonicalMigrationDryRun(firestoreId)
  base.migrationClass = plan.migrationClass
  base.targetPgId = plan.targetPgId
  base.blockers = [...plan.blockers]

  // Re-classify with positive human map (planner currently dry-run without map).
  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(firestoreId).get()
  if (!snap.exists) {
    base.blockers.push('firestore_doc_missing')
    return base
  }
  const data = (snap.data() ?? {}) as Record<string, unknown>
  const evidence = migrationEvidenceFromFirestoreDoc(snap.id, data)

  const db = requireDb()
  const mirrors = await db
    .select({
      id: news.id,
      legacyFirestoreId: news.legacyFirestoreId,
      slug: news.slug,
      status: news.status,
      migrationBatchId: news.migrationBatchId,
    })
    .from(news)
    .where(or(eq(news.legacyFirestoreId, firestoreId), eq(news.id, firestoreId)))
    .limit(2)

  if (mirrors.length > 1) {
    base.blockers.push('duplicate_pg_mirror_rows')
    return base
  }

  if (mirrors[0]) {
    base.outcome = 'ALREADY_MIGRATED'
    base.targetPgId = mirrors[0].id
    base.status = mirrors[0].status
    base.migrationBatchId = mirrors[0].migrationBatchId
    base.blockers = []
    return base
  }

  const eligibility = classifyMigrationEligibility({
    evidence,
    pgMirror: null,
    trustedEditorialActorUids: opts.trustedEditorialActorUids,
  })
  base.migrationClass = eligibility.migrationClass
  base.targetPgId = eligibility.targetPgId
  base.blockers = Array.from(new Set([...plan.blockers, ...eligibility.blockers]))

  if (eligibility.migrationClass !== 'HUMAN_ACTOR_VERIFIED') {
    base.blockers.push(`class_not_HUMAN_ACTOR_VERIFIED:${eligibility.migrationClass}`)
    return base
  }
  if (!eligibility.human.proven || !eligibility.human.actorInTrustedEditorialMap) {
    base.blockers.push('human_actor_not_positively_verified')
    return base
  }
  if (plan.publisherMapping.status !== 'resolved') {
    base.blockers.push(`publisher_${plan.publisherMapping.status}`)
    return base
  }
  if (plan.slugImpact.status === 'collision' || plan.slugImpact.status === 'invalid') {
    base.blockers.push(`slug_${plan.slugImpact.status}`)
    return base
  }
  if (!plan.bodyEligibility.meetsMinimum || !plan.bodyEligibility.sourceUrlExists) {
    base.blockers.push('body_or_source_gate')
    return base
  }
  if (base.blockers.length > 0) {
    return base
  }

  // Prefer exact FS id; refuse silent replacement on collision.
  if (eligibility.targetPgId !== firestoreId) {
    base.blockers.push('target_pg_id_not_equal_fs_id')
    return base
  }

  const idCollision = await db
    .select({ id: news.id })
    .from(news)
    .where(or(eq(news.id, firestoreId), eq(news.legacyFirestoreId, firestoreId)))
    .limit(1)
  if (idCollision[0]) {
    base.blockers.push('pg_id_or_legacy_collision')
    return base
  }

  if (opts.mode === 'dry-run') {
    base.outcome = 'PLANNED'
    base.migrationBatchId = opts.batchId
    base.status = 'draft'
    return base
  }

  // authorId / categoryId only if FK-safe
  const authorCandidate = asString(data.authorId)
  let authorId: string | null = null
  if (authorCandidate) {
    const u = await db
      .select({ uid: users.firebaseUid })
      .from(users)
      .where(eq(users.firebaseUid, authorCandidate))
      .limit(1)
    authorId = u[0]?.uid ?? null
  }

  const categoryCandidate = asString(data.categoryId)
  let categoryId: string | null = null
  if (categoryCandidate) {
    const c = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, categoryCandidate))
      .limit(1)
    categoryId = c[0]?.id ?? null
  }

  const title = asString(data.title)
  const slug = asString(data.slug)
  if (!title || !slug) {
    base.blockers.push('title_or_slug_missing')
    return base
  }

  const now = new Date()
  const publishedAt = asDate(data.publishedAt)
  const createdAt = asDate(data.createdAt) ?? publishedAt ?? now
  const updatedAt = asDate(data.updatedAt) ?? now
  const approvedAt = asDate(data.approvedAt)
  const approvedBy = asString(data.approvedBy)
  const publishedBy = asString(data.publishedBy)

  const summaryRaw = asString(data.summary) || asString(data.description)
  const description = asString(data.description)
  const content = asString(data.content)
  const htmlContent =
    asString(data.htmlContent) || asString((data as { html_content?: unknown }).html_content)
  const source =
    plan.publisherMapping.publisherSlug ||
    asString(data.source) ||
    plan.publisherMapping.publisherId
  const sourceUrl = asString(data.sourceUrl) || asString((data as { source_url?: unknown }).source_url)
  const thumbnailUrl = asString(data.thumbnailUrl) || asString(data.imageUrl)
  const coverImageUrl = asString(data.coverImageUrl) || asString(data.imageUrl)
  const videoUrl = asString(data.videoUrl)
  const tags = Array.isArray(data.tags)
    ? (data.tags.filter((t) => typeof t === 'string') as string[])
    : null
  const cityName = asString(data.cityName)
  const citySlug = asString(data.citySlug)
  const districtName = asString(data.districtName)
  const districtSlug = asString(data.districtSlug)
  const authorDisplayName = asString(data.authorDisplayName) || asString(data.authorName)
  const seoTitle = asString(data.seoTitle)
  const seoDescription = asString(data.seoDescription)

  await db.insert(news).values({
      id: firestoreId,
      legacyFirestoreId: firestoreId,
      slug,
      title,
      summary: summaryRaw ? summaryRaw.slice(0, 500) : null,
      description,
      content,
      htmlContent,
      status: 'draft',
      categoryId,
      cityName,
      citySlug,
      districtName,
      districtSlug,
      authorId,
      authorDisplayName,
      source,
      sourceUrl,
      thumbnailUrl,
      coverImageUrl,
      videoUrl,
      tags,
      isAiGenerated: data.aiAutoPublished === true,
      isBreaking: data.isBreaking === true,
      seoTitle,
      seoDescription,
      publicationAuthority: 'HUMAN_EDITOR',
      approvedBy,
      approvedAt,
      publishedBy,
      migratedAt: now,
      migrationBatchId: opts.batchId,
      // Safe migration defaults — never fabricate CLEARED/LICENSED/OWNED.
      rightsStatus: 'PENDING',
      rightsBasis: 'UNKNOWN',
      // Historical publish timestamp preserved; status remains draft (not public).
      publishedAt,
      createdAt,
      updatedAt,
    })

  const verify = await db
    .select({
      id: news.id,
      legacyFirestoreId: news.legacyFirestoreId,
      status: news.status,
      publicationAuthority: news.publicationAuthority,
      migrationBatchId: news.migrationBatchId,
    })
    .from(news)
    .where(eq(news.id, firestoreId))
    .limit(1)

  const row = verify[0]
  if (!row || row.status !== 'draft' || row.legacyFirestoreId !== firestoreId) {
    base.blockers.push('post_insert_verify_failed')
    return base
  }

  base.outcome = 'INSERTED'
  base.status = row.status
  base.migrationBatchId = row.migrationBatchId
  base.targetPgId = row.id
  return base
}

/**
 * Sequential pilot runner. Enforces MAX_PILOT_RECORDS.
 * Stops after first unexpected REFUSED during execute mode (after dry-run gates).
 */
async function runSequentialMigration(opts: {
  firestoreIds: string[]
  mode: PilotExecuteMode
  hardMax: number
  batchPrefix: string
  stopOnUnexpected?: boolean
}): Promise<PilotRunResult> {
  const ids = assertHardIdList(opts.firestoreIds, opts.hardMax)
  const batchId = buildBatchId(opts.batchPrefix)
  const trusted = await loadTrustedEditorialActorUids()
  const results: PilotCandidateResult[] = []
  let stop = false

  for (const id of ids) {
    if (stop) {
      results.push({
        firestoreId: id,
        mode: opts.mode,
        outcome: 'STOPPED',
        migrationClass: null,
        targetPgId: null,
        status: null,
        blockers: ['stopped_after_prior_failure'],
        migrationBatchId: null,
        similarityState: 'SIMILARITY_NOT_EVALUATED',
      })
      continue
    }

    const r = await migrateOneCanonicalDraftPilot({
      firestoreId: id,
      mode: opts.mode,
      batchId,
      trustedEditorialActorUids: trusted,
    })
    results.push(r)

    if (
      opts.mode === 'execute' &&
      opts.stopOnUnexpected !== false &&
      r.outcome !== 'INSERTED' &&
      r.outcome !== 'ALREADY_MIGRATED'
    ) {
      stop = true
    }
  }

  return {
    mode: opts.mode,
    batchId,
    hardMax: opts.hardMax,
    requestedIds: ids,
    results,
    insertedCount: results.filter((r) => r.outcome === 'INSERTED').length,
    refusedCount: results.filter((r) => r.outcome === 'REFUSED').length,
    alreadyMigratedCount: results.filter((r) => r.outcome === 'ALREADY_MIGRATED').length,
  }
}

/**
 * Sequential pilot runner. Enforces MAX_PILOT_RECORDS (P18.4C).
 * Stops after first unexpected REFUSED during execute mode (after dry-run gates).
 */
export async function runCanonicalDraftMigrationPilot(opts: {
  firestoreIds: string[]
  mode: PilotExecuteMode
  /** Stop remaining candidates after first non-success in execute mode. */
  stopOnUnexpected?: boolean
}): Promise<PilotRunResult> {
  return runSequentialMigration({
    firestoreIds: opts.firestoreIds,
    mode: opts.mode,
    hardMax: MAX_PILOT_RECORDS,
    batchPrefix: P18_4C_BATCH_PREFIX,
    stopOnUnexpected: opts.stopOnUnexpected,
  })
}

/**
 * P18.4E bounded cohort #1 runner. Reuses same migrateOne path; hard max 10;
 * batch prefix P18_4E_. Never publishes.
 */
export async function runCanonicalDraftMigrationCohort(opts: {
  firestoreIds: string[]
  mode: PilotExecuteMode
  stopOnUnexpected?: boolean
}): Promise<PilotRunResult> {
  return runSequentialMigration({
    firestoreIds: opts.firestoreIds,
    mode: opts.mode,
    hardMax: MAX_COHORT_RECORDS,
    batchPrefix: P18_4E_BATCH_PREFIX,
    stopOnUnexpected: opts.stopOnUnexpected,
  })
}

/** Snapshot counts for pre/post reports (no secrets). */
export async function snapshotNewsUniverseCounts(): Promise<{
  pgTotal: number
  pgDraft: number
  pgPublished: number
  pgArchived: number
}> {
  const db = requireDb()
  const [total] = await db.select({ c: count() }).from(news)
  const [draft] = await db
    .select({ c: count() })
    .from(news)
    .where(eq(news.status, 'draft'))
  const [published] = await db
    .select({ c: count() })
    .from(news)
    .where(eq(news.status, 'published'))
  const [archived] = await db
    .select({ c: count() })
    .from(news)
    .where(eq(news.status, 'archived'))
  return {
    pgTotal: Number(total?.c ?? 0),
    pgDraft: Number(draft?.c ?? 0),
    pgPublished: Number(published?.c ?? 0),
    pgArchived: Number(archived?.c ?? 0),
  }
}

/** Rollback selector: only P18.4C draft rows with no dependent production mutations expected. */
export function rollbackPilotDraftCriteria(batchId: string) {
  return and(
    eq(news.migrationBatchId, batchId),
    eq(news.status, 'draft'),
    sql`${news.migrationBatchId} LIKE ${P18_4C_BATCH_PREFIX + '%'}`
  )
}
