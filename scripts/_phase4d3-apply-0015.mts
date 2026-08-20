/**
 * Apply Phase 4D.3 additive migration 0015 (lease + draft snapshot) to Neon.
 * Idempotent IF NOT EXISTS. Never DROP/TRUNCATE.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!(k in process.env)) process.env[k] = v
  }
}

loadEnvLocal()

async function main() {
  const apply = process.argv.includes('--apply')
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  const sqlText = readFileSync(
    resolve(process.cwd(), 'src/db/migrations/0015_phase4d3_ai_worker_lease.sql'),
    'utf8',
  )
  const executable = sqlText
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toUpperCase()
  for (const bad of ['DROP TABLE', 'TRUNCATE', 'DROP SCHEMA', 'DELETE FROM']) {
    if (executable.includes(bad)) throw new Error(`Refusing destructive SQL: ${bad}`)
  }

  const before = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'crawler_ai_jobs'
      AND column_name IN (
        'lease_owner','lease_expires_at','execution_id','draft_snapshot','failure_code','event_revision'
      )
    ORDER BY 1`
  console.log(JSON.stringify({ apply, beforeCols: before }, null, 2))

  if (!apply) {
    console.log('Dry-run only. Pass --apply to execute.')
    return
  }

  const statements = sqlText
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const stmt of statements) {
    await sql.query(stmt)
  }

  const after = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'crawler_ai_jobs'
      AND column_name IN (
        'lease_owner','lease_expires_at','execution_id','draft_snapshot','failure_code','event_revision'
      )
    ORDER BY 1`
  const idx = await sql`
    SELECT indexname FROM pg_indexes
    WHERE indexname IN ('crawler_ai_jobs_claim_queue_idx','crawler_ai_jobs_lease_expires_idx','crawler_ai_jobs_execution_uidx')
    ORDER BY 1`
  console.log(JSON.stringify({ afterCols: after, indexes: idx }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
