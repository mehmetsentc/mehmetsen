/**
 * P18.4E.2 — Read-only cohort source-overlap audit runner.
 * NO rights mutation. NO publish. NO AI.
 *
 * Usage: npx tsx scripts/p18_4e2_source_overlap_audit.mts
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

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

const BATCH = 'P18_4E_20260904T172223Z'
const PILOTS = ['0ALMkrRCE3LQqubviNZh', '0SdmPVCnO8pVAbMENA9f', '0XYEJVwyi7oILuYKf91R'] as const

async function main() {
  const { auditCanonicalDraftSourceOverlap } = await import(
    '../src/services/editorial/canonicalDraftSourceOverlapAudit'
  )
  const { evaluateCanonicalDraftPublishGate } = await import(
    '../src/services/editorial/newsRightsDecision'
  )
  const { snapshotNewsUniverseCounts } = await import(
    '../src/services/editorial/canonicalDraftMigrationPilot'
  )

  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
  const pre = await snapshotNewsUniverseCounts()

  const cohort = await sql`
    SELECT id, title, source, source_url, status::text AS status,
           rights_status::text AS rights_status, rights_basis::text AS rights_basis,
           editorial_blocker, length(coalesce(content,''))::int AS body_len,
           publication_authority::text AS auth
    FROM news
    WHERE migration_batch_id = ${BATCH}
    ORDER BY id`

  if (cohort.length !== 10) {
    throw new Error(`Expected 10 cohort rows, got ${cohort.length}`)
  }

  const results = []
  for (const row of cohort) {
    const audit = await auditCanonicalDraftSourceOverlap({ newsId: String(row.id) })
    const gate = evaluateCanonicalDraftPublishGate({
      status: String(row.status),
      rightsStatus: row.rights_status,
      rightsBasis: row.rights_basis,
      editorialBlocker: row.editorial_blocker,
      slug: 'x',
      title: String(row.title || ''),
      content: 'c'.repeat(Number(row.body_len) || 200),
      sourceUrl: row.source_url ? String(row.source_url) : null,
    })
    results.push({
      id: row.id,
      publisher: row.source,
      title: row.title,
      bodyLength: row.body_len,
      sourceFetch: audit.sourceFetchStatus,
      sourceBodyAvailable: audit.sourceBodyAvailable,
      deepOverlap: audit.ngram3,
      similarity: audit.similarity,
      maxSharedRun: audit.maxSharedContiguousRun,
      risk: audit.risk,
      existingBlocker: row.editorial_blocker,
      rights: row.rights_status,
      basis: row.rights_basis,
      publishable: gate.publishable,
      gateBlockers: gate.blockers,
      auditNote: audit.note,
    })
    console.error(JSON.stringify({ id: row.id, risk: audit.risk, fetch: audit.sourceFetchStatus }))
  }

  const pilots = await sql`
    SELECT id, status::text, rights_status::text, rights_basis::text, editorial_blocker
    FROM news WHERE id = ANY(${[...PILOTS]})`

  const post = await snapshotNewsUniverseCounts()
  const rightsStill = await sql`
    SELECT count(*)::int AS c FROM news
    WHERE migration_batch_id = ${BATCH}
      AND status = 'draft'
      AND rights_status = 'PENDING'
      AND rights_basis = 'UNKNOWN'`

  const summary = {
    LOW_OVERLAP: results.filter((r) => r.risk === 'LOW_OVERLAP').length,
    MEDIUM_OVERLAP: results.filter((r) => r.risk === 'MEDIUM_OVERLAP').length,
    HIGH_SOURCE_OVERLAP: results.filter((r) => r.risk === 'HIGH_SOURCE_OVERLAP').length,
    SOURCE_NOT_EVALUABLE: results.filter((r) => r.risk === 'SOURCE_NOT_EVALUABLE').length,
  }

  const out = {
    phase: 'P18.4E.2',
    batch: BATCH,
    aiCalls: 0,
    rightsMutated: false,
    published: false,
    pre,
    post,
    cohortPendingUnknown: rightsStill[0]?.c,
    summary,
    results,
    pilots,
  }

  const path = resolve(process.cwd(), 'scripts/_p18_4e2_source_overlap_audit_out.json')
  writeFileSync(path, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  console.error(`Wrote ${path}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
