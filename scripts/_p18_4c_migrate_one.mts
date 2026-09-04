/**
 * P18.4C — Sequential single-ID draft migrate (explicit ID argv).
 * Usage:
 *   npx tsx scripts/_p18_4c_migrate_one.mts --dry-run <fsId>
 *   EXECUTE_P18_4C=1 npx tsx scripts/_p18_4c_migrate_one.mts <fsId>
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
    writeFileSync(resolve(stubDir, 'package.json'), JSON.stringify({ name: 'server-only', main: 'index.js' }))
  }
}

const ALLOWED = new Set([
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
])

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run')
  const dryArg = process.argv.includes('--dry-run')
  const id = args[0]?.trim()
  if (!id || !ALLOWED.has(id)) {
    throw new Error('Exact allowed pilot ID required')
  }
  const mode =
    !dryArg && process.env.EXECUTE_P18_4C === '1' ? 'execute' : 'dry-run'

  const {
    runCanonicalDraftMigrationPilot,
    snapshotNewsUniverseCounts,
  } = await import('../src/services/editorial/canonicalDraftMigrationPilot')
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  const pre = await snapshotNewsUniverseCounts()
  const run = await runCanonicalDraftMigrationPilot({
    firestoreIds: [id],
    mode,
    stopOnUnexpected: true,
  })
  const post = await snapshotNewsUniverseCounts()
  const rows = await sql`
    SELECT id, legacy_firestore_id AS legacy, status::text AS status,
           publication_authority::text AS authority, migration_batch_id AS batch,
           slug, source
    FROM news WHERE id = ${id}`

  const out = { mode, pre, run, post, row: rows[0] ?? null }
  console.log(JSON.stringify(out, null, 2))
  if (mode === 'execute' && run.results[0]?.outcome !== 'INSERTED' && run.results[0]?.outcome !== 'ALREADY_MIGRATED') {
    process.exit(2)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
