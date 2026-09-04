/** P18.4D.7 — READ-ONLY gate/actor verify for pilots (no writes). */
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

const SCHEMA_FLOOR = new Date('2026-09-04T00:00:00.000Z')

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
    FROM users WHERE role = ANY(${[...TRUSTED_EDITORIAL_ROLES]})
  `
  const roleByUid = new Map(roleRows.map((r) => [String(r.uid), String(r.role)]))

  const [counts] = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status='draft')::int AS draft,
           count(*) FILTER (WHERE status='published')::int AS published
    FROM news`

  const rows = await sql`
    SELECT id, status::text AS status, publication_authority::text AS publication_authority,
           rights_status::text AS rights_status, rights_basis::text AS rights_basis,
           rights_decided_by, rights_decided_at, editorial_blocker,
           slug, title, source, source_url, content, published_by, published_at,
           legacy_firestore_id
    FROM news WHERE id = ANY(${[...IDS]}) ORDER BY id`

  const out = {
    counts,
    publishApiExists: false,
    note:
      'PG news status→published has no authenticated CMS route; only rights decision API exists and executePublish=false',
    candidates: rows.map((row) => {
      const uid = row.rights_decided_by ? String(row.rights_decided_by) : null
      let actorClass:
        | 'VERIFIED_HUMAN_EDITOR'
        | 'INVALID_ACTOR'
        | 'MISSING_ACTOR'
        | 'NO_DECISION' = 'NO_DECISION'
      let role: string | null = null
      if (!uid) {
        actorClass =
          row.rights_status && String(row.rights_status) !== 'PENDING'
            ? 'MISSING_ACTOR'
            : 'NO_DECISION'
      } else if (isExactKnownAutomationUid(uid) || isAutomationIdentity(uid)) {
        actorClass = 'INVALID_ACTOR'
      } else if (trusted.has(uid)) {
        actorClass = 'VERIFIED_HUMAN_EDITOR'
        role = roleByUid.get(uid) ?? null
      } else {
        actorClass = 'INVALID_ACTOR'
        role = roleByUid.get(uid) ?? null
      }

      const ts = row.rights_decided_at ? new Date(row.rights_decided_at as string) : null
      const tsOk =
        !ts
          ? String(row.rights_status) === 'PENDING' || !row.rights_status
          : !Number.isNaN(ts.getTime()) &&
            ts.getTime() >= SCHEMA_FLOOR.getTime() &&
            ts.getTime() <= Date.now() + 5 * 60 * 1000

      const gate = evaluateCanonicalDraftPublishGate({
        status: String(row.status),
        rightsStatus: row.rights_status ? String(row.rights_status) : null,
        rightsBasis: row.rights_basis ? String(row.rights_basis) : null,
        editorialBlocker: row.editorial_blocker ? String(row.editorial_blocker) : null,
        slug: row.slug ? String(row.slug) : null,
        title: row.title ? String(row.title) : null,
        content: row.content ? String(row.content) : null,
        sourceUrl: row.source_url ? String(row.source_url) : null,
      })

      let readiness = 'KEEP_DRAFT_PENDING'
      if (String(row.id) === '0SdmPVCnO8pVAbMENA9f') readiness = 'NEEDS_EDITORIAL_REWRITE'
      else if (gate.publishable && actorClass === 'VERIFIED_HUMAN_EDITOR' && tsOk) {
        readiness = 'READY_FOR_HUMAN_PUBLISH'
      } else if (String(row.rights_status) === 'CLEARED' && !gate.publishable) {
        readiness = 'BLOCKED_GATE'
      } else if (String(row.rights_status) === 'PENDING') {
        readiness = 'KEEP_DRAFT_PENDING'
      }

      return {
        id: row.id,
        status: row.status,
        rights_status: row.rights_status,
        rights_basis: row.rights_basis,
        editorial_blocker: row.editorial_blocker,
        has_actor: Boolean(uid),
        actor_fp: uid ? createHash('sha256').update(uid).digest('hex').slice(0, 12) : null,
        actorClass,
        role,
        rights_decided_at: ts ? ts.toISOString() : null,
        tsOk,
        slug: row.slug,
        has_source: Boolean(row.source_url),
        gate,
        readiness,
        published_by_present: Boolean(row.published_by),
        published_at: row.published_at,
        legacy_firestore_id: row.legacy_firestore_id,
      }
    }),
  }

  writeFileSync(resolve('scripts/_p18_4d7_verify_out.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
