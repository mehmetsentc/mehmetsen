/**
 * Apply P18.3O impressions FK drop + lookback indexes (idempotent).
 * Usage:
 *   npx tsx scripts/apply-p18-3o-persistent-seen-migration.mts
 *   npx tsx scripts/apply-p18-3o-persistent-seen-migration.mts --apply
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
    resolve(process.cwd(), 'src/db/migrations/0038_phase_p18_3o_persistent_seen.sql'),
    'utf8'
  )

  const executable = sqlText
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toUpperCase()
  for (const bad of ['DROP TABLE', 'TRUNCATE', 'DROP SCHEMA', 'DELETE FROM', 'INSERT INTO']) {
    if (executable.includes(bad)) {
      throw new Error(`REFUSING migration: contains ${bad}`)
    }
  }

  const before = await sql`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'user_content_impressions_article_id_news_fk',
      'user_content_impressions_article_id_news_id_fk'
    )
    ORDER BY 1
  `
  console.log('BEFORE_FKS', before)

  if (!apply) {
    console.log('DRY_RUN only. Pass --apply to execute.')
    return
  }

  const statements = sqlText
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const stmt of statements) {
    console.log('EXEC', stmt.slice(0, 120).replace(/\s+/g, ' '), '...')
    await sql.query(stmt)
  }

  const after = await sql`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'user_content_impressions_article_id_news_fk',
      'user_content_impressions_article_id_news_id_fk'
    )
    ORDER BY 1
  `
  console.log('AFTER_FKS', after)
  console.log(JSON.stringify({ ok: true, remainingFks: after.length }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
