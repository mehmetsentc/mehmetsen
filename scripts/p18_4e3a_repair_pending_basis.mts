/**
 * P18.4E.3A — Repair accidental PENDING + non-UNKNOWN cohort rows.
 * Only repairs draft PENDING rows with inconsistent basis/decision metadata.
 * NO publish. NO CLEARED. NO AI.
 *
 * Usage: npx tsx scripts/p18_4e3a_repair_pending_basis.mts
 */
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
    writeFileSync(
      resolve(stubDir, 'package.json'),
      JSON.stringify({ name: 'server-only', main: 'index.js' })
    )
  }
}

const BATCH = 'P18_4E_20260904T172223Z'

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const { repairPendingRightsConsistency, evaluateCanonicalDraftPublishGate } = await import(
    '../src/services/editorial/newsRightsDecision'
  )

  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  const candidates = await sql`
    SELECT id, rights_status::text AS rights_status, rights_basis::text AS rights_basis,
           (rights_decided_by IS NOT NULL AND length(trim(rights_decided_by)) > 0) AS has_actor
    FROM news
    WHERE migration_batch_id = ${BATCH}
      AND status = 'draft'
      AND rights_status = 'PENDING'
      AND (
        coalesce(rights_basis::text, 'UNKNOWN') <> 'UNKNOWN'
        OR (rights_decided_by IS NOT NULL AND length(trim(rights_decided_by)) > 0)
      )
    ORDER BY id`

  const repairs = []
  for (const row of candidates) {
    const r = await repairPendingRightsConsistency(String(row.id))
    repairs.push({ beforeCandidate: row, ...r })
  }

  const cohort = await sql`
    SELECT id, rights_status::text AS rights_status, rights_basis::text AS rights_basis,
           (rights_decided_by IS NOT NULL) AS has_actor, status::text AS status,
           editorial_blocker, length(coalesce(content,''))::int AS body_len, source_url
    FROM news WHERE migration_batch_id = ${BATCH} ORDER BY id`

  const integrity = {
    total: cohort.length,
    pendingUnknown: cohort.filter(
      (r) => r.rights_status === 'PENDING' && r.rights_basis === 'UNKNOWN'
    ).length,
    pendingNonUnknown: cohort.filter(
      (r) => r.rights_status === 'PENDING' && r.rights_basis !== 'UNKNOWN'
    ).length,
    cleared: cohort.filter((r) => r.rights_status === 'CLEARED').length,
    rewrite: cohort.filter((r) => r.rights_status === 'REWRITE_REQUIRED').length,
    dnp: cohort.filter((r) => r.rights_status === 'DO_NOT_PUBLISH').length,
    published: cohort.filter((r) => r.status === 'published').length,
  }

  const touched = ['wUzimisXG1JZZqdRdHt5', '1Z22cs0LfMcvrwwgaSTn']
  const gates = []
  for (const id of touched) {
    const row = cohort.find((c) => c.id === id)
    if (!row) continue
    gates.push({
      id,
      gate: evaluateCanonicalDraftPublishGate({
        status: String(row.status),
        rightsStatus: row.rights_status,
        rightsBasis: row.rights_basis,
        editorialBlocker: row.editorial_blocker,
        slug: 'x',
        title: 't',
        content: 'c'.repeat(Math.max(200, Number(row.body_len) || 200)),
        sourceUrl: row.source_url ? String(row.source_url) : 'https://example.com',
      }),
    })
  }

  const out = {
    phase: 'P18.4E.3A',
    candidatesFound: candidates.length,
    repairs,
    integrity,
    gates,
  }
  writeFileSync(
    resolve(process.cwd(), 'scripts/_p18_4e3a_repair_pending_basis_out.json'),
    JSON.stringify(out, null, 2)
  )
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
