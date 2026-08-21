/**
 * Apply Phase 4F.3.1 additive migration 0019 (unique shadow economics).
 * Idempotent IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. Refuses DROP/TRUNCATE/DELETE.
 * Usage: npx tsx scripts/_phase4f31-apply-0019.mts --apply
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
    resolve(process.cwd(), 'src/db/migrations/0019_phase4f31_shadow_unique_economics.sql'),
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

  const beforeCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'crawler_ai_shadow_decisions' ORDER BY 1`
  const beforeEcon = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crawler_ai_shadow_economic_decisions'`
  console.log('BEFORE_COLS', beforeCols.length, 'BEFORE_ECON', beforeEcon)

  if (!apply) {
    console.log('DRY_RUN only. Pass --apply to execute.')
    return
  }

  const statements = sqlText
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const stmt of statements) {
    console.log('EXEC', stmt.slice(0, 120).replace(/\s+/g, ' '))
    await sql.query(stmt)
  }

  const afterCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'crawler_ai_shadow_decisions' ORDER BY 1`
  const afterEcon = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crawler_ai_shadow_economic_decisions'`
  const econCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'crawler_ai_shadow_economic_decisions' ORDER BY 1`
  const out = { at: new Date().toISOString(), beforeCols, afterCols, beforeEcon, afterEcon, econCols }
  writeFileSync('tmp-phase4f31-migration.json', JSON.stringify(out, null, 2))
  console.log('AFTER_COLS', afterCols.length, 'ECON', afterEcon, 'ECON_COLS', econCols.length)
  console.log('WROTE tmp-phase4f31-migration.json')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
