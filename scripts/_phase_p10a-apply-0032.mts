/**
 * Apply Phase P10A additive migration 0032 (commercial ledger).
 * Idempotent IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. Refuses DROP/TRUNCATE/DELETE.
 * Usage: npx tsx scripts/_phase_p10a-apply-0032.mts --apply
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
    resolve(process.cwd(), 'src/db/migrations/0032_phase_p10a_commercial_ledger.sql'),
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
        'payment_intents',
        'payment_transactions',
        'commercial_ledger_entries',
        'publisher_earnings',
        'commercial_audit_events'
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
        'payment_intents',
        'payment_transactions',
        'commercial_ledger_entries',
        'publisher_earnings',
        'commercial_audit_events'
      )
    ORDER BY 1`
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ad_bookings'
      AND column_name IN (
        'gross_amount_minor',
        'platform_commission_rate_bps',
        'platform_commission_minor',
        'publisher_net_minor',
        'commercial_frozen'
      )
    ORDER BY 1`
  const out = { at: new Date().toISOString(), before, after, bookingCols: cols }
  writeFileSync('tmp-phase-p10a-migration.json', JSON.stringify(out, null, 2))
  console.log('AFTER', after)
  console.log('BOOKING_COLS', cols)
  console.log('WROTE tmp-phase-p10a-migration.json')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
