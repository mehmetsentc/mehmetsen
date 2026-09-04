/**
 * Apply P18.4D.2 news rights decision schema + seed C2 editorial blocker.
 * Usage:
 *   npx tsx scripts/apply-p18-4d2-news-rights-decision.mts
 *   npx tsx scripts/apply-p18-4d2-news-rights-decision.mts --apply
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
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL missing')
  const sql = neon(url)

  const sqlText = readFileSync(
    resolve(process.cwd(), 'src/db/migrations/0040_phase_p18_4d2_news_rights_decision.sql'),
    'utf8'
  )

  const executable = sqlText
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toUpperCase()
  for (const bad of ['DROP TABLE', 'TRUNCATE', 'DROP SCHEMA', 'DELETE FROM', 'INSERT INTO']) {
    if (executable.includes(bad)) throw new Error(`REFUSING migration: contains ${bad}`)
  }

  const beforeCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='news' AND column_name IN (
      'rights_status','rights_basis','rights_decided_by','rights_decided_at','editorial_blocker'
    ) ORDER BY 1`
  const beforeCount = await sql`SELECT count(*)::int AS c, count(*) FILTER (WHERE status='published')::int AS pub FROM news`
  console.log('BEFORE_COLS', beforeCols)
  console.log('BEFORE_NEWS', beforeCount[0])

  if (!apply) {
    console.log('DRY_RUN only. Pass --apply to execute.')
    return
  }

  const statements = sqlText
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const stmt of statements) {
    console.log('EXEC', stmt.slice(0, 90).replace(/\s+/g, ' '), '...')
    await sql.query(stmt)
  }

  // Durable C2 rewrite blocker from P18.4D.1 (not human CLEAR)
  await sql`
    UPDATE news SET
      rights_status = 'REWRITE_REQUIRED',
      rights_basis = 'UNKNOWN',
      editorial_blocker = 'HIGH_SOURCE_OVERLAP',
      updated_at = NOW()
    WHERE id = '0SdmPVCnO8pVAbMENA9f'
      AND status = 'draft'
      AND legacy_firestore_id = '0SdmPVCnO8pVAbMENA9f'`

  const afterCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='news' AND column_name IN (
      'rights_status','rights_basis','rights_decided_by','rights_decided_at','editorial_blocker'
    ) ORDER BY 1`
  const afterCount = await sql`SELECT count(*)::int AS c, count(*) FILTER (WHERE status='published')::int AS pub FROM news`
  const pilots = await sql`
    SELECT id, status::text, rights_status::text AS rs, rights_basis::text AS rb, editorial_blocker
    FROM news WHERE id = ANY(${[
      '0ALMkrRCE3LQqubviNZh',
      '0SdmPVCnO8pVAbMENA9f',
      '0XYEJVwyi7oILuYKf91R',
    ]})`
  console.log('AFTER_COLS', afterCols)
  console.log('AFTER_NEWS', afterCount[0])
  console.log('PILOTS', pilots)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
