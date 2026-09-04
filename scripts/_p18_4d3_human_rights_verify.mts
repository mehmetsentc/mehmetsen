/**
 * P18.4D.3 — READ-ONLY human rights decision verification + publish readiness gate.
 * Does NOT publish. Does NOT mutate. Does NOT expose raw UIDs in output.
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

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
    writeFileSync(resolve(stubDir, 'package.json'), JSON.stringify({ name: 'server-only', main: 'index.js' }))
  }
}

const IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

const LABELS: Record<string, string> = {
  '0ALMkrRCE3LQqubviNZh': 'C1_Cumhuriyet',
  '0SdmPVCnO8pVAbMENA9f': 'C2_Bogaz',
  '0XYEJVwyi7oILuYKf91R': 'C3_Dunya',
}

/** P18.4D.2 foundation landed ~2026-09-04; refuse epoch / pre-schema stamps. */
const SCHEMA_FLOOR = new Date('2026-09-04T00:00:00.000Z')
const NOW = new Date()

function uidFingerprint(uid: string | null | undefined): string | null {
  if (!uid) return null
  return createHash('sha256').update(uid).digest('hex').slice(0, 12)
}

function classifyActor(
  uid: string | null | undefined,
  trusted: Set<string>,
  roleByUid: Map<string, string>,
  isAuto: (s: string) => boolean,
  isExactAuto: (s: string) => boolean
): {
  class: 'VERIFIED_HUMAN_EDITOR' | 'INVALID_ACTOR' | 'MISSING_ACTOR' | 'NO_DECISION'
  role: string | null
  exactTrusted: boolean
  automationRejected: boolean
  fp: string | null
} {
  if (!uid) {
    return {
      class: 'NO_DECISION',
      role: null,
      exactTrusted: false,
      automationRejected: false,
      fp: null,
    }
  }
  const exact = uid.trim()
  const fp = uidFingerprint(exact)
  if (!exact) {
    return {
      class: 'MISSING_ACTOR',
      role: null,
      exactTrusted: false,
      automationRejected: false,
      fp,
    }
  }
  if (isExactAuto(exact) || isAuto(exact)) {
    return {
      class: 'INVALID_ACTOR',
      role: roleByUid.get(exact) ?? null,
      exactTrusted: false,
      automationRejected: true,
      fp,
    }
  }
  const role = roleByUid.get(exact) ?? null
  const exactTrusted = trusted.has(exact)
  if (exactTrusted) {
    return {
      class: 'VERIFIED_HUMAN_EDITOR',
      role,
      exactTrusted: true,
      automationRejected: false,
      fp,
    }
  }
  return {
    class: 'INVALID_ACTOR',
    role,
    exactTrusted: false,
    automationRejected: false,
    fp,
  }
}

function validateTimestamp(iso: string | Date | null | undefined, rightsStatus: string | null) {
  if (!rightsStatus || rightsStatus === 'PENDING') {
    return { required: false, valid: true, reason: 'pending_or_absent_ok' as const }
  }
  if (!iso) {
    return { required: true, valid: false, reason: 'missing_timestamp' as const }
  }
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return { required: true, valid: false, reason: 'invalid_timestamp' as const }
  }
  if (d.getTime() < SCHEMA_FLOOR.getTime()) {
    return { required: true, valid: false, reason: 'before_schema_floor' as const }
  }
  if (d.getTime() > NOW.getTime() + 5 * 60 * 1000) {
    return { required: true, valid: false, reason: 'future_timestamp' as const }
  }
  if (d.getTime() < Date.UTC(2020, 0, 1)) {
    return { required: true, valid: false, reason: 'epoch_or_fabricated' as const }
  }
  return {
    required: true,
    valid: true,
    reason: 'ok' as const,
    iso: d.toISOString(),
  }
}

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  const { evaluateCanonicalDraftPublishGate } = await import(
    '../src/services/editorial/newsRightsDecision'
  )
  const { loadTrustedEditorialActorUids } = await import(
    '../src/services/editorial/trustedEditorialActors'
  )
  const { isAutomationIdentity } = await import('../src/services/editorial/humanReviewGate')
  const { isExactKnownAutomationUid } = await import(
    '../src/services/editorial/publicationAuthority'
  )
  const { TRUSTED_EDITORIAL_ROLES } = await import(
    '../src/services/editorial/canonicalMigrationEligibility'
  )

  const trusted = await loadTrustedEditorialActorUids()
  const roleRows = await sql`
    SELECT firebase_uid AS uid, role::text AS role
    FROM users
    WHERE role = ANY(${[...TRUSTED_EDITORIAL_ROLES]})
  `
  const roleByUid = new Map<string, string>()
  for (const r of roleRows) {
    if (r.uid) roleByUid.set(String(r.uid), String(r.role))
  }

  const [counts] = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'draft')::int AS draft,
      count(*) FILTER (WHERE status = 'published')::int AS published
    FROM news
  `

  const pilots = await sql`
    SELECT
      id,
      status::text AS status,
      publication_authority::text AS publication_authority,
      rights_status::text AS rights_status,
      rights_basis::text AS rights_basis,
      rights_decided_by,
      rights_decided_at,
      editorial_blocker,
      approved_by,
      approved_at,
      published_by,
      legacy_firestore_id,
      slug,
      title,
      source,
      source_url,
      length(coalesce(content, ''))::int AS body_len,
      coalesce(content, '') AS content,
      migration_batch_id,
      migrated_at
    FROM news
    WHERE id = ANY(${[...IDS]})
    ORDER BY id
  `

  // Prior deep-overlap evidence (read-only artifacts from D/D.1) — no recompute AI
  let priorSimilarity: Record<string, unknown> = {}
  try {
    const deep = JSON.parse(
      readFileSync(resolve(process.cwd(), 'scripts/_p18_4d_review_out.json'), 'utf8')
    )
    for (const r of deep.reviews || []) {
      priorSimilarity[r.id] = {
        source: 'p18_4d_review_out',
        fidelity: r.similarity ?? null,
        transformClass: r.transformClass ?? null,
        transformNote: r.transformNote ?? null,
      }
    }
  } catch {
    /* optional */
  }
  try {
    const d1 = JSON.parse(
      readFileSync(resolve(process.cwd(), 'scripts/_p18_4d1_post_verify_out.json'), 'utf8')
    )
    if (d1?.c2) priorSimilarity['0SdmPVCnO8pVAbMENA9f'] = {
      ...(priorSimilarity['0SdmPVCnO8pVAbMENA9f'] as object),
      d1: d1.c2,
    }
  } catch {
    /* optional */
  }

  const socialTotals = await sql`
    SELECT
      (SELECT count(*)::int FROM article_likes) AS likes,
      (SELECT count(*)::int FROM saved_articles) AS saves,
      (SELECT count(*)::int FROM article_comments) AS comments,
      (SELECT count(*)::int FROM user_content_impressions) AS seen
  `

  const socialPer = await sql`
    SELECT n.id::text AS id,
      (SELECT count(*)::int FROM article_likes l WHERE l.article_id = n.id) AS likes,
      (SELECT count(*)::int FROM user_content_impressions i WHERE i.article_id = n.id) AS seen
    FROM news n
    WHERE n.id = ANY(${[...IDS]})
  `

  const remaps = await sql`
    SELECT count(*)::int AS c FROM information_schema.tables
    WHERE table_name IN ('social_id_remap', 'seen_id_remap', 'article_id_remap')
  `.catch(() => [{ c: 0 }])

  // Sitemap / published slug leakage for pilots
  const pilotSlugs = pilots.map((p) => p.slug).filter(Boolean)
  const publishedSlugClash = pilotSlugs.length
    ? await sql`
        SELECT id, slug, status::text AS status
        FROM news
        WHERE slug = ANY(${pilotSlugs}) AND status = 'published'
      `
    : []

  const publishedPilot = pilots.filter((p) => p.status === 'published')

  // news-sitemap sample: only published; drafts must not appear in PG published set
  const sitemapEligiblePilots = await sql`
    SELECT id, slug, status::text AS status
    FROM news
    WHERE id = ANY(${[...IDS]}) AND status = 'published'
  `

  // Audit history tables for news rights?
  const auditTables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (
        table_name ILIKE '%news%audit%'
        OR table_name ILIKE '%rights%audit%'
        OR table_name ILIKE '%canonical%audit%'
      )
  `

  const candidates = []
  for (const row of pilots) {
    const id = String(row.id)
    const rightsStatus = row.rights_status ? String(row.rights_status) : null
    const rightsBasis = row.rights_basis ? String(row.rights_basis) : null
    const actorUid = row.rights_decided_by ? String(row.rights_decided_by) : null

    const actor = classifyActor(
      actorUid,
      trusted,
      roleByUid,
      isAutomationIdentity,
      isExactKnownAutomationUid
    )

    // If PENDING with no actor → NO_DECISION even if classify said MISSING
    let actorClass = actor.class
    if ((!rightsStatus || rightsStatus === 'PENDING') && !actorUid) {
      actorClass = 'NO_DECISION'
    } else if (rightsStatus && rightsStatus !== 'PENDING' && !actorUid) {
      actorClass = 'MISSING_ACTOR'
    }

    const ts = validateTimestamp(row.rights_decided_at as string | Date | null, rightsStatus)

    const gate = evaluateCanonicalDraftPublishGate({
      status: String(row.status),
      rightsStatus,
      rightsBasis,
      editorialBlocker: row.editorial_blocker ? String(row.editorial_blocker) : null,
      slug: row.slug ? String(row.slug) : null,
      title: row.title ? String(row.title) : null,
      content: row.content ? String(row.content) : null,
      sourceUrl: row.source_url ? String(row.source_url) : null,
    })

    // Basis evidence (read-only)
    const basisEvidence: Record<string, unknown> = {
      sourceUrlPresent: Boolean(row.source_url),
      sourceHost: row.source_url
        ? (() => {
            try {
              return new URL(String(row.source_url)).host
            } catch {
              return null
            }
          })()
        : null,
      publisherIdPresent: null,
      sourceField: row.source ?? null,
      bodyLen: row.body_len,
      priorSimilarity: priorSimilarity[id] ?? null,
    }

    let basisValid: 'n/a' | 'ok' | 'reject' | 'insufficient_evidence' = 'n/a'
    let basisNote = ''
    if (rightsStatus === 'CLEARED') {
      if (!rightsBasis || rightsBasis === 'UNKNOWN') {
        basisValid = 'reject'
        basisNote = 'CLEARED_with_UNKNOWN_basis'
      } else if (
        rightsBasis === 'LICENSED' ||
        rightsBasis === 'OWNED' ||
        rightsBasis === 'OFFICIAL_RELEASE'
      ) {
        // No durable license/ownership columns on news — cannot accept without evidence store
        basisValid = 'insufficient_evidence'
        basisNote = 'no_durable_license_ownership_evidence_columns'
      } else if (rightsBasis === 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION') {
        const blocker = row.editorial_blocker ? String(row.editorial_blocker) : null
        if (blocker) {
          basisValid = 'reject'
          basisNote = `editorial_blocker_present:${blocker}`
        } else if (!row.source_url) {
          basisValid = 'reject'
          basisNote = 'source_url_missing'
        } else {
          basisValid = 'ok'
          basisNote = 'source_attribution_present_no_blocker'
        }
      } else if (
        rightsBasis === 'PUBLISHER_ORIGINAL' ||
        rightsBasis === 'SOURCE_ASSOCIATED' ||
        rightsBasis === 'HUMAN_REVIEWED_OTHER'
      ) {
        if (!row.source_url && rightsBasis !== 'PUBLISHER_ORIGINAL') {
          basisValid = 'insufficient_evidence'
          basisNote = 'source_url_missing'
        } else {
          basisValid = 'ok'
          basisNote = 'basis_accepted_with_provenance_fields'
        }
      } else {
        basisValid = 'insufficient_evidence'
        basisNote = `unhandled_basis:${rightsBasis}`
      }
    }

    // Readiness classification
    let readiness:
      | 'READY_FOR_HUMAN_PUBLISH'
      | 'NEEDS_RIGHTS_REVIEW'
      | 'NEEDS_EDITORIAL_REWRITE'
      | 'INVALID_RIGHTS_DECISION'
      | 'KEEP_DRAFT_PENDING'
      | 'BLOCKED_INVALID_RIGHTS_DECISION'

    const c2Safety =
      id === '0SdmPVCnO8pVAbMENA9f'
        ? {
            expectedRewrite: rightsStatus === 'REWRITE_REQUIRED',
            expectedBlocker: String(row.editorial_blocker || '') === 'HIGH_SOURCE_OVERLAP',
            wronglyCleared: rightsStatus === 'CLEARED',
          }
        : null

    if (id === '0SdmPVCnO8pVAbMENA9f') {
      if (rightsStatus === 'CLEARED' && row.editorial_blocker) {
        readiness = 'NEEDS_EDITORIAL_REWRITE' // gate must still block
      } else if (rightsStatus === 'REWRITE_REQUIRED') {
        readiness = 'NEEDS_EDITORIAL_REWRITE'
      } else {
        readiness = 'NEEDS_EDITORIAL_REWRITE'
      }
    } else if (!rightsStatus || rightsStatus === 'PENDING') {
      readiness = 'KEEP_DRAFT_PENDING'
    } else if (actorClass === 'INVALID_ACTOR' || actorClass === 'MISSING_ACTOR') {
      readiness = 'INVALID_RIGHTS_DECISION'
    } else if (!ts.valid) {
      readiness = 'INVALID_RIGHTS_DECISION'
    } else if (rightsStatus === 'CLEARED' && basisValid !== 'ok') {
      readiness = 'BLOCKED_INVALID_RIGHTS_DECISION'
    } else if (rightsStatus === 'CLEARED' && gate.publishable && actorClass === 'VERIFIED_HUMAN_EDITOR') {
      readiness = 'READY_FOR_HUMAN_PUBLISH'
    } else if (rightsStatus === 'REWRITE_REQUIRED' || rightsStatus === 'DO_NOT_PUBLISH') {
      readiness =
        rightsStatus === 'REWRITE_REQUIRED' ? 'NEEDS_EDITORIAL_REWRITE' : 'NEEDS_RIGHTS_REVIEW'
    } else if (gate.blockers.includes('rights_pending')) {
      readiness = 'KEEP_DRAFT_PENDING'
    } else if (!gate.publishable) {
      readiness = 'NEEDS_RIGHTS_REVIEW'
    } else {
      readiness = 'NEEDS_RIGHTS_REVIEW'
    }

    candidates.push({
      label: LABELS[id],
      id,
      status: row.status,
      publication_authority: row.publication_authority,
      rights_status: rightsStatus,
      rights_basis: rightsBasis,
      rights_decided_by_fp: actor.fp,
      rights_decided_at: row.rights_decided_at
        ? new Date(row.rights_decided_at as string).toISOString()
        : null,
      editorial_blocker: row.editorial_blocker,
      approved_by_present: Boolean(row.approved_by),
      approved_at: row.approved_at
        ? new Date(row.approved_at as string).toISOString()
        : null,
      published_by_present: Boolean(row.published_by),
      legacy_firestore_id: row.legacy_firestore_id,
      slug: row.slug,
      source: row.source,
      source_url_present: Boolean(row.source_url),
      body_len: row.body_len,
      migration_batch_id: row.migration_batch_id,
      actor: { ...actor, class: actorClass, uid: undefined },
      timestamp: ts,
      basisValid,
      basisNote,
      basisEvidence,
      gate: {
        publishable: gate.publishable,
        executePublish: gate.executePublish,
        blockers: gate.blockers,
      },
      c2Safety,
      readiness,
      social: socialPer.find((s) => s.id === id) ?? null,
    })
  }

  const out = {
    phase: 'P18.4D.3',
    readOnly: true,
    mutated: false,
    trustedActorCount: trusted.size,
    counts,
    pilotPublished: publishedPilot.length,
    publishedSlugClash,
    sitemapEligiblePilots,
    socialTotals: socialTotals[0],
    remapTablesPresent: remaps[0]?.c ?? 0,
    auditTables: auditTables.map((t) => t.table_name),
    rightsAuditHistory: auditTables.length
      ? 'tables_named_audit_exist_check_contents'
      : 'NONE — latest-state fields only on news (rights_status/basis/decided_by/at)',
    candidates,
  }

  const outPath = resolve(process.cwd(), 'scripts/_p18_4d3_verify_out.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  console.error(`wrote ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
