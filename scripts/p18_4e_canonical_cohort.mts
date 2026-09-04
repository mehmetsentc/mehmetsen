/**
 * P18.4E — Bounded canonical cohort #1 (max 10 draft migrations).
 *
 * Reuses P18.4C migrateOne path via runCanonicalDraftMigrationCohort.
 * Default: discover + dry-run only.
 * Execute: EXECUTE_P18_4E=1
 *
 * NEVER publishes. NEVER calls AI. NEVER mutates Firestore/social/seen.
 *
 * Usage:
 *   npx tsx scripts/p18_4e_canonical_cohort.mts
 *   EXECUTE_P18_4E=1 npx tsx scripts/p18_4e_canonical_cohort.mts
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { neon } from '@neondatabase/serverless'
import {
  TRUSTED_EDITORIAL_ROLES,
  classifyMigrationEligibility,
  migrationEvidenceFromFirestoreDoc,
  type MigrationEligibilityClass,
} from '../src/services/editorial/canonicalMigrationEligibility'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}

loadEnvLocal()

{
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  if (!existsSync(stubDir)) {
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(resolve(stubDir, 'index.js'), 'module.exports = {};\n')
    writeFileSync(
      resolve(stubDir, 'package.json'),
      JSON.stringify({ name: 'server-only', main: 'index.js' })
    )
  }
}

/** Pilot rows — never re-select or mutate. */
const EXCLUDE_PILOT_IDS = new Set([
  '0ALMkrRCE3LQqubviNZh', // C1
  '0SdmPVCnO8pVAbMENA9f', // C2
  '0XYEJVwyi7oILuYKf91R', // C3
])

const MAX_SELECT = 10

type RiskClass =
  | 'LOW_TRANSFORMATION_RISK'
  | 'MEDIUM_REVIEW_REQUIRED'
  | 'HIGH_SOURCE_OVERLAP'
  | 'NOT_EVALUATED'

function structuralRisk(opts: {
  bodyChars: number
  sourceUrl: string | null
  rightsStatus: string | null
  rightsBasis: string | null
}): RiskClass {
  const basis = (opts.rightsBasis || '').toUpperCase()
  const status = (opts.rightsStatus || '').toUpperCase()
  if (status === 'REWRITE_REQUIRED' || basis === 'HIGH_SOURCE_OVERLAP') {
    return 'HIGH_SOURCE_OVERLAP'
  }
  // No paid AI similarity — structural screen only.
  if (!opts.sourceUrl || opts.bodyChars < 200) return 'MEDIUM_REVIEW_REQUIRED'
  return 'NOT_EVALUATED'
}

function initFs() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!.trim(),
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!.trim(),
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n').trim(),
      }),
    })
  }
  return getFirestore()
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

async function main() {
  const {
    MAX_COHORT_RECORDS,
    runCanonicalDraftMigrationCohort,
    snapshotNewsUniverseCounts,
  } = await import('../src/services/editorial/canonicalDraftMigrationPilot')
  const { planCanonicalMigrationDryRun } = await import(
    '../src/services/editorial/canonicalMigrationPlanner'
  )

  if (MAX_SELECT > MAX_COHORT_RECORDS) {
    throw new Error('Script MAX_SELECT exceeds MAX_COHORT_RECORDS')
  }

  const mode = process.env.EXECUTE_P18_4E === '1' ? 'execute' : 'dry-run'
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
  const db = initFs()

  const pre = await snapshotNewsUniverseCounts()
  const [likes] = await sql`SELECT count(*)::int AS c FROM article_likes`
  const [saves] = await sql`SELECT count(*)::int AS c FROM saved_articles`
  const [comments] = await sql`SELECT count(*)::int AS c FROM article_comments`
  const [seen] = await sql`SELECT count(*)::int AS c FROM user_content_impressions`

  const trustedRows = await sql`
    SELECT firebase_uid AS uid
    FROM users
    WHERE role::text = ANY(${[...TRUSTED_EDITORIAL_ROLES]})`
  const trusted = new Set(trustedRows.map((r) => String(r.uid)))

  const pgLegacy = await sql`
    SELECT id, legacy_firestore_id AS fs_id, slug, status::text AS status
    FROM news
    WHERE legacy_firestore_id IS NOT NULL`
  const mirrorMap = new Map(
    pgLegacy.map((r) => [
      String(r.fs_id),
      {
        id: String(r.id),
        legacyFirestoreId: String(r.fs_id),
        slug: String(r.slug),
        status: String(r.status),
      },
    ])
  )
  const pgIdSet = new Set((await sql`SELECT id FROM news`).map((r) => String(r.id)))
  const pgSlugSet = new Set((await sql`SELECT slug FROM news`).map((r) => String(r.slug)))

  const counts: Record<string, number> = {
    MIRROR_ALREADY_CANONICAL: 0,
    HUMAN_ACTOR_VERIFIED: 0,
    HUMAN_AUTHORITY_UNVERIFIED_ACTOR: 0,
    LEGACY_REVIEW_REQUIRED: 0,
    QUARANTINED: 0,
    INSUFFICIENT_EVIDENCE: 0,
    PROVEN_HUMAN: 0,
  }

  type RawCand = {
    id: string
    slug: string | null
    title: string | null
    publisherHint: string | null
    sourceUrl: string | null
    bodyChars: number
    rightsStatus: string | null
    rightsBasis: string | null
  }
  const verifiedPool: RawCand[] = []

  const PAGE = 500
  let lastDoc: QueryDocumentSnapshot | undefined
  let scanned = 0

  for (;;) {
    let q = db.collection('news').orderBy('__name__').limit(PAGE)
    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break
    for (const doc of snap.docs) {
      scanned += 1
      const data = doc.data() as Record<string, unknown>
      const evidence = migrationEvidenceFromFirestoreDoc(doc.id, data)
      const pgMirror =
        mirrorMap.get(doc.id) ||
        (pgIdSet.has(doc.id)
          ? {
              id: doc.id,
              legacyFirestoreId: mirrorMap.get(doc.id)?.legacyFirestoreId ?? doc.id,
              slug: String(data.slug || ''),
              status: 'published',
            }
          : null)

      const result = classifyMigrationEligibility({
        evidence,
        pgMirror,
        trustedEditorialActorUids: trusted,
      })
      counts[result.migrationClass] = (counts[result.migrationClass] || 0) + 1

      if (EXCLUDE_PILOT_IDS.has(doc.id)) continue
      if (result.migrationClass !== 'HUMAN_ACTOR_VERIFIED') continue
      if (!result.body.meetsMinimum || !result.body.sourceUrlExists) continue
      if (!evidence.slug || !evidence.title) continue
      if (result.blockers.length > 0) continue
      if (!(evidence.publisherId || evidence.ingestionSourceId || evidence.sourceId)) continue
      if (pgIdSet.has(doc.id) || mirrorMap.has(doc.id)) continue
      if (pgSlugSet.has(evidence.slug)) continue

      verifiedPool.push({
        id: doc.id,
        slug: evidence.slug,
        title: evidence.title,
        publisherHint: evidence.publisherId || evidence.ingestionSourceId || evidence.sourceId,
        sourceUrl: evidence.sourceUrl,
        bodyChars: result.body.bodyChars,
        rightsStatus: evidence.rightsStatus,
        rightsBasis: evidence.rightsBasis,
      })
    }
    lastDoc = snap.docs[snap.docs.length - 1]
    if (scanned % 5000 === 0) {
      console.error(JSON.stringify({ scanned, verifiedPool: verifiedPool.length, counts }))
    }
    if (snap.size < PAGE) break
  }

  // Prefer complete body, then diversify publishers, then low social via planner.
  verifiedPool.sort((a, b) => b.bodyChars - a.bodyChars)

  type Planned = {
    id: string
    publisher: string | null
    title: string | null
    bodyLength: number
    humanProvenance: string
    sourceHost: string | null
    risk: RiskClass
    social: { likes: number; saves: number; comments: number }
    seen: number
    cluster: string
    identityCollision: 'none' | 'skip'
    migrationClass: MigrationEligibilityClass | null
    blockers: string[]
    planOk: boolean
  }

  const planned: Planned[] = []
  const skipped: Array<{ id: string; reason: string }> = []
  const usedPublishers = new Set<string>()

  for (const c of verifiedPool) {
    if (planned.length >= MAX_SELECT) break

    const plan = await planCanonicalMigrationDryRun(c.id)
    const socialTotal =
      plan.socialIdentityImpact.likes +
      plan.socialIdentityImpact.saves +
      plan.socialIdentityImpact.comments
    const seenN = plan.seenIdentityImpact.impressionRows
    const clusterStatus = plan.clusterMapping.status
    const pub = plan.publisherMapping.publisherSlug || c.publisherHint || 'unknown'

    const hardBlock =
      plan.migrationClass !== 'HUMAN_ACTOR_VERIFIED' ||
      plan.publisherMapping.status !== 'resolved' ||
      plan.slugImpact.status === 'collision' ||
      plan.slugImpact.status === 'invalid' ||
      plan.targetPgId !== c.id ||
      plan.blockers.some((b) =>
        [
          'pg_id_or_legacy_collision',
          'cluster_orphan_published_news_id',
          'cluster_points_elsewhere',
          'slug_collision',
        ].includes(b)
      ) ||
      // Skip complicated social/cluster remaps for cohort #1
      clusterStatus === 'orphan_ref' ||
      clusterStatus === 'ambiguous' ||
      socialTotal > 50 ||
      seenN > 500

    if (hardBlock) {
      skipped.push({
        id: c.id,
        reason: plan.blockers[0] || `cluster=${clusterStatus}|social=${socialTotal}|seen=${seenN}`,
      })
      continue
    }

    // Soft diversity: prefer unused publishers until we have 10
    if (usedPublishers.has(pub) && planned.length < MAX_SELECT && usedPublishers.size < MAX_SELECT) {
      // defer — try later only if pool exhausted
      continue
    }

    planned.push({
      id: c.id,
      publisher: plan.publisherMapping.publisherSlug || c.publisherHint,
      title: c.title,
      bodyLength: c.bodyChars,
      humanProvenance: 'approvedBy_or_publishedBy_in_trusted_editorial_set',
      sourceHost: hostOf(c.sourceUrl),
      risk: structuralRisk({
        bodyChars: c.bodyChars,
        sourceUrl: c.sourceUrl,
        rightsStatus: c.rightsStatus,
        rightsBasis: c.rightsBasis,
      }),
      social: {
        likes: plan.socialIdentityImpact.likes,
        saves: plan.socialIdentityImpact.saves,
        comments: plan.socialIdentityImpact.comments,
      },
      seen: seenN,
      cluster: clusterStatus,
      identityCollision: 'none',
      migrationClass: plan.migrationClass,
      blockers: plan.blockers,
      planOk: true,
    })
    usedPublishers.add(pub)
  }

  // Second pass: fill remaining slots ignoring publisher diversity
  if (planned.length < MAX_SELECT) {
    const selectedIds = new Set(planned.map((p) => p.id))
    for (const c of verifiedPool) {
      if (planned.length >= MAX_SELECT) break
      if (selectedIds.has(c.id)) continue
      if (skipped.some((s) => s.id === c.id)) continue

      const plan = await planCanonicalMigrationDryRun(c.id)
      const socialTotal =
        plan.socialIdentityImpact.likes +
        plan.socialIdentityImpact.saves +
        plan.socialIdentityImpact.comments
      const seenN = plan.seenIdentityImpact.impressionRows
      const clusterStatus = plan.clusterMapping.status

      if (
        plan.migrationClass !== 'HUMAN_ACTOR_VERIFIED' ||
        plan.publisherMapping.status !== 'resolved' ||
        plan.slugImpact.status === 'collision' ||
        plan.slugImpact.status === 'invalid' ||
        plan.targetPgId !== c.id ||
        clusterStatus === 'orphan_ref' ||
        clusterStatus === 'ambiguous' ||
        socialTotal > 50 ||
        seenN > 500
      ) {
        skipped.push({
          id: c.id,
          reason: plan.blockers[0] || `fill_skip|cluster=${clusterStatus}`,
        })
        continue
      }

      // Prefer NOT_EVALUATED / MEDIUM over HIGH
      const risk = structuralRisk({
        bodyChars: c.bodyChars,
        sourceUrl: c.sourceUrl,
        rightsStatus: c.rightsStatus,
        rightsBasis: c.rightsBasis,
      })
      if (risk === 'HIGH_SOURCE_OVERLAP') {
        skipped.push({ id: c.id, reason: 'HIGH_SOURCE_OVERLAP' })
        continue
      }

      planned.push({
        id: c.id,
        publisher: plan.publisherMapping.publisherSlug || c.publisherHint,
        title: c.title,
        bodyLength: c.bodyChars,
        humanProvenance: 'approvedBy_or_publishedBy_in_trusted_editorial_set',
        sourceHost: hostOf(c.sourceUrl),
        risk,
        social: {
          likes: plan.socialIdentityImpact.likes,
          saves: plan.socialIdentityImpact.saves,
          comments: plan.socialIdentityImpact.comments,
        },
        seen: seenN,
        cluster: clusterStatus,
        identityCollision: 'none',
        migrationClass: plan.migrationClass,
        blockers: plan.blockers,
        planOk: true,
      })
      selectedIds.add(c.id)
    }
  }

  // Drop HIGH risk from planned if safer replacements exist (already filtered in fill)
  const selectedIds = planned.filter((p) => p.risk !== 'HIGH_SOURCE_OVERLAP').slice(0, MAX_SELECT)
  if (selectedIds.length === 0) {
    console.error('NO eligible cohort candidates')
    process.exit(2)
  }
  if (selectedIds.length > MAX_COHORT_RECORDS) {
    throw new Error('Selected exceeds MAX_COHORT_RECORDS')
  }

  const firestoreIds = selectedIds.map((p) => p.id)

  const run = await runCanonicalDraftMigrationCohort({
    firestoreIds,
    mode,
    stopOnUnexpected: true,
  })

  const post = await snapshotNewsUniverseCounts()
  const [likes2] = await sql`SELECT count(*)::int AS c FROM article_likes`
  const [saves2] = await sql`SELECT count(*)::int AS c FROM saved_articles`
  const [comments2] = await sql`SELECT count(*)::int AS c FROM article_comments`
  const [seen2] = await sql`SELECT count(*)::int AS c FROM user_content_impressions`

  const idempotency =
    mode === 'execute'
      ? await runCanonicalDraftMigrationCohort({
          firestoreIds,
          mode: 'execute',
          stopOnUnexpected: true,
        })
      : null

  // Pilot regression snapshot
  const pilotRows = await sql`
    SELECT id, status::text AS status, rights_status::text AS rights_status,
           rights_basis::text AS rights_basis, slug, migration_batch_id
    FROM news
    WHERE id = ANY(${[...EXCLUDE_PILOT_IDS]})`

  const cohortRows =
    mode === 'execute'
      ? await sql`
          SELECT id, status::text AS status, rights_status::text AS rights_status,
                 rights_basis::text AS rights_basis, publication_authority::text AS auth,
                 legacy_firestore_id, migration_batch_id, migrated_at
          FROM news
          WHERE id = ANY(${firestoreIds})`
      : []

  const out = {
    phase: 'P18.4E',
    mode,
    scanned,
    trustedEditorialUidCount: trusted.size,
    migrationClassCounts: counts,
    verifiedPoolSize: verifiedPool.length,
    plannedCount: selectedIds.length,
    skippedCount: skipped.length,
    skippedSample: skipped.slice(0, 20),
    selected: selectedIds,
    pre: {
      ...pre,
      social: { likes: likes.c, saves: saves.c, comments: comments.c },
      seen: seen.c,
    },
    run: {
      batchId: run.batchId,
      hardMax: run.hardMax,
      insertedCount: run.insertedCount,
      refusedCount: run.refusedCount,
      alreadyMigratedCount: run.alreadyMigratedCount,
      results: run.results.map((r) => ({
        firestoreId: r.firestoreId,
        outcome: r.outcome,
        status: r.status,
        migrationClass: r.migrationClass,
        blockers: r.blockers,
        migrationBatchId: r.migrationBatchId,
      })),
    },
    post: {
      ...post,
      social: { likes: likes2.c, saves: saves2.c, comments: comments2.c },
      seen: seen2.c,
    },
    socialDelta: {
      likes: Number(likes2.c) - Number(likes.c),
      saves: Number(saves2.c) - Number(saves.c),
      comments: Number(comments2.c) - Number(comments.c),
      seen: Number(seen2.c) - Number(seen.c),
    },
    idempotency: idempotency
      ? {
          batchId: idempotency.batchId,
          alreadyMigratedCount: idempotency.alreadyMigratedCount,
          insertedCount: idempotency.insertedCount,
          results: idempotency.results.map((r) => ({
            firestoreId: r.firestoreId,
            outcome: r.outcome,
          })),
        }
      : null,
    pilotRegression: pilotRows,
    cohortRows,
  }

  const outPath = resolve(process.cwd(), 'scripts/_p18_4e_canonical_cohort_out.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  console.error(`Wrote ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
