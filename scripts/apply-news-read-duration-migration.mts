/**
 * Apply news.read_duration_ms (idempotent).
 * Usage:
 *   npx tsx scripts/apply-news-read-duration-migration.mts
 *   npx tsx scripts/apply-news-read-duration-migration.mts --apply
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
    console.log('DRY_RUN only. Pass --apply to add news.read_duration_ms.')
    return
  }

  await sql`ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "read_duration_ms" integer NOT NULL DEFAULT 0`
  console.log('OK news.read_duration_ms')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
