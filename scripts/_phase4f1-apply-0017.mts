/**
 * Apply Phase 4F.1 additive migration 0017 (machine eligibility columns).
 * Idempotent IF NOT EXISTS. Refuses DROP/TRUNCATE.
 * Usage: npx tsx scripts/_phase4f1-apply-0017.mts --apply
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
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
    resolve(process.cwd(), 'src/db/migrations/0017_phase4f1_machine_eligibility.sql'),
    'utf8'
  )
  const executable = sqlText
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toUpperCase()
  for (const bad of ['DROP TABLE', 'TRUNCATE', 'DROP SCHEMA', 'DELETE FROM', 'DROP COLUMN']) {
    if (executable.includes(bad)) throw new Error(`REFUSING migration: contains ${bad}`)
  }

  const before = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'news_clusters'
      AND column_name LIKE 'machine_draft%'
    ORDER BY 1`
  console.log('BEFORE_COLS', before)

  if (!apply) {
    console.log('DRY_RUN only. Pass --apply to execute.')
    return
  }

  const statements = sqlText
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const stmt of statements) {
    console.log('EXEC', stmt.slice(0, 100).replace(/\s+/g, ' '))
    await sql.query(stmt)
  }

  const after = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'news_clusters'
      AND column_name LIKE 'machine_draft%'
    ORDER BY 1`
  const out = { at: new Date().toISOString(), before, after }
  writeFileSync('tmp-phase4f1-migration.json', JSON.stringify(out, null, 2))
  console.log('AFTER_COLS', after)
  console.log('WROTE tmp-phase4f1-migration.json')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
