/**
 * Apply Phase P10 additive migration 0033 (self-managed ads).
 * Idempotent IF NOT EXISTS. Refuses DROP/TRUNCATE/DELETE.
 * Usage: npx tsx scripts/_phase_p10-apply-0033.mts --apply
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
    resolve(process.cwd(), 'src/db/migrations/0033_phase_p10_self_managed_ads.sql'),
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
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'publisher_managed_ads',
        'publisher_ad_creatives',
        'publisher_ad_impressions',
        'publisher_ad_clicks'
      )
    ORDER BY 1`
  console.log('BEFORE_TABLES', before)

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

  const after = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'publisher_managed_ads',
        'publisher_ad_creatives',
        'publisher_ad_impressions',
        'publisher_ad_clicks'
      )
    ORDER BY 1`
  console.log('AFTER_TABLES', after)
  console.log('P10_MIGRATION_0033_OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
