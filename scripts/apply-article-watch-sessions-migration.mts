/**
 * Apply article_watch_sessions + news page-dwell aggregates (idempotent).
 * Usage:
 *   npx tsx scripts/apply-article-watch-sessions-migration.mts
 *   npx tsx scripts/apply-article-watch-sessions-migration.mts --apply
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal() {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '../../.env.local'),
    resolve('/Users/user/nahaber/.env.local'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
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
    break
  }
}

loadEnvLocal()

async function main() {
  const apply = process.argv.includes('--apply')
  const { neon } = await import('@neondatabase/serverless')
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL missing')
  const sql = neon(url)

  if (!apply) {
    console.log('DRY_RUN only. Pass --apply to add article_watch_sessions + news page aggregates.')
    return
  }

  await sql`ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "page_duration_ms" integer NOT NULL DEFAULT 0`
  await sql`ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "watch_session_count" integer NOT NULL DEFAULT 0`
  await sql`ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "page_session_count" integer NOT NULL DEFAULT 0`
  await sql`
    CREATE TABLE IF NOT EXISTS "article_watch_sessions" (
      "id" varchar(64) PRIMARY KEY,
      "article_id" varchar(64) NOT NULL,
      "actor_key" varchar(160) NOT NULL,
      "user_id" varchar(128),
      "session_hash" varchar(64),
      "surface" varchar(16) NOT NULL,
      "view_counted" integer NOT NULL DEFAULT 0,
      "content_dwell_ms" integer NOT NULL DEFAULT 0,
      "page_dwell_ms" integer NOT NULL DEFAULT 0,
      "first_at" timestamptz NOT NULL DEFAULT now(),
      "last_at" timestamptz NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "article_watch_sessions_actor_uidx" ON "article_watch_sessions" ("article_id", "actor_key", "surface")`
  await sql`CREATE INDEX IF NOT EXISTS "article_watch_sessions_article_last_idx" ON "article_watch_sessions" ("article_id", "last_at")`
  await sql`CREATE INDEX IF NOT EXISTS "article_watch_sessions_last_idx" ON "article_watch_sessions" ("last_at")`
  console.log('OK article_watch_sessions + news page_duration_ms / watch_session_count / page_session_count')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
