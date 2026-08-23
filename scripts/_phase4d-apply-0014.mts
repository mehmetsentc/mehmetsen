/**
 * Apply Phase 4D additive migration 0014 to Neon (idempotent IF NOT EXISTS).
 * Prints before/after counts. Never DROP/TRUNCATE.
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

async function snapshot(sql: any) {
  const [raw] = await sql`SELECT count(*)::int AS c FROM raw_articles`
  const [clusters] = await sql`SELECT count(*)::int AS c FROM news_clusters`
  const [sources] = await sql`SELECT count(*)::int AS c FROM news_sources`
  const [published] = await sql`SELECT count(*)::int AS c FROM raw_articles WHERE editorial_status = 'PUBLISHED'`
  const [audit] = await sql`SELECT count(*)::int AS c FROM crawler_editorial_audit`
  const [approved] = await sql`SELECT count(*)::int AS c FROM news_clusters WHERE editorial_decision = 'APPROVED_FOR_AI'`
  const [jobs] = await sql`SELECT count(*)::int AS c FROM crawler_ai_jobs`
  const [ledger] = await sql`SELECT count(*)::int AS c FROM crawler_ai_cost_ledger`
  return {
    raw: raw.c,
    clusters: clusters.c,
    sources: sources.c,
    published: published.c,
    audit: audit.c,
    approved: approved.c,
    jobs: jobs.c,
    ledger: ledger.c,
  }
}

async function phase4dPresent(sql: any) {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'news_clusters'
      AND column_name IN ('content_fingerprint','drafted_content_fingerprint','auto_draft_status')
    ORDER BY 1
  `
  const ledgerCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'crawler_ai_cost_ledger'
      AND column_name IN ('reason','mode','failure_code')
    ORDER BY 1
  `
  const idx = await sql`
    SELECT indexname FROM pg_indexes WHERE indexname = 'crawler_ai_jobs_cluster_active_uidx'
  `
  return { cols, ledgerCols, idx }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  const sqlText = readFileSync(
    resolve(process.cwd(), 'src/db/migrations/0014_phase4d_controlled_auto_draft.sql'),
    'utf8',
  )
  // Safety: refuse destructive keywords in executable SQL (ignore -- comments)
  const executable = sqlText
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toUpperCase()
  for (const bad of ['DROP TABLE', 'TRUNCATE', 'DROP SCHEMA', 'DELETE FROM']) {
    if (executable.includes(bad)) {
      throw new Error(`REFUSING migration: contains ${bad}`)
    }
  }

  console.log('BEFORE', await snapshot(sql))
  console.log('BEFORE_4D', await phase4dPresent(sql))

  if (!apply) {
    console.log('DRY_RUN only. Pass --apply to execute.')
    return
  }

  // Split on statement-breakpoint comments used by drizzle
  const statements = sqlText
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const stmt of statements) {
    console.log('EXEC', stmt.slice(0, 80).replace(/\s+/g, ' '), '...')
    await sql.query(stmt)
  }

  console.log('AFTER', await snapshot(sql))
  console.log('AFTER_4D', await phase4dPresent(sql))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
