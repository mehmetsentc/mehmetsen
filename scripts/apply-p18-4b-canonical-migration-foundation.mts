/**
 * Apply P18.4B news provenance schema (idempotent).
 * Usage:
 *   npx tsx scripts/apply-p18-4b-canonical-migration-foundation.mts
 *   npx tsx scripts/apply-p18-4b-canonical-migration-foundation.mts --apply
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
    resolve(process.cwd(), 'src/db/migrations/0039_phase_p18_4b_canonical_migration_foundation.sql'),
    'utf8'
  )

  const executable = sqlText
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toUpperCase()
  for (const bad of ['DROP TABLE', 'TRUNCATE', 'DROP SCHEMA', 'DELETE FROM', 'INSERT INTO', 'UPDATE ']) {
    if (executable.includes(bad)) {
      throw new Error(`REFUSING migration: contains ${bad}`)
    }
  }

  const beforeCols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'news'
      AND column_name IN (
        'publication_authority','approved_by','approved_at','published_by',
        'migrated_at','migration_batch_id','legacy_firestore_id'
      )
    ORDER BY 1`
  const beforeCount = await sql`SELECT count(*)::int AS c, count(*) FILTER (WHERE status='published')::int AS pub FROM news`
  console.log('BEFORE_COLS', beforeCols)
  console.log('BEFORE_NEWS', beforeCount[0])

  if (!apply) {
    console.log('DRY_RUN only. Pass --apply to execute schema ALTERs.')
    return
  }

  const statements = sqlText
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const stmt of statements) {
    console.log('EXEC', stmt.slice(0, 100).replace(/\s+/g, ' '), '...')
    await sql.query(stmt)
  }

  const afterCols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'news'
      AND column_name IN (
        'publication_authority','approved_by','approved_at','published_by',
        'migrated_at','migration_batch_id'
      )
    ORDER BY 1`
  const afterCount = await sql`SELECT count(*)::int AS c, count(*) FILTER (WHERE status='published')::int AS pub FROM news`
  console.log('AFTER_COLS', afterCols)
  console.log('AFTER_NEWS', afterCount[0])
  if (Number(afterCount[0]?.c) !== Number(beforeCount[0]?.c)) {
    throw new Error('NEWS ROW COUNT CHANGED — unexpected')
  }
  if (Number(afterCount[0]?.pub) !== Number(beforeCount[0]?.pub)) {
    throw new Error('PUBLISHED COUNT CHANGED — unexpected')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
