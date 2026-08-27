/**
 * P11.1 — migration + publisher inventory check (read-only).
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
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.log(JSON.stringify({ ok: false, error: 'NO_DATABASE_URL' }))
    process.exit(1)
  }
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)

  const idx = await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'publisher_feature_access' ORDER BY 1`
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'publisher_feature_access'
    ORDER BY ordinal_position`
  let drizzle: unknown = null
  try {
    drizzle = await sql`
      SELECT id, hash, created_at
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC LIMIT 8`
  } catch {
    try {
      drizzle = await sql`
        SELECT id, hash, created_at
        FROM __drizzle_migrations
        ORDER BY created_at DESC LIMIT 8`
    } catch (e) {
      drizzle = { error: String(e) }
    }
  }
  const pubs = await sql`
    SELECT id, slug, display_name, status, verification_status, publisher_type, primary_domain
    FROM publishers ORDER BY display_name`
  const market = await sql`
    SELECT 'campaigns' AS k, count(*)::int AS c FROM advertiser_campaigns
    UNION ALL SELECT 'booking_requests', count(*)::int FROM ad_booking_requests
    UNION ALL SELECT 'bookings', count(*)::int FROM ad_bookings`.catch(async () => {
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name LIKE '%campaign%' OR table_name LIKE '%booking%' OR table_name LIKE 'advertiser%')
      ORDER BY 1`
    return tables
  })

  console.log(JSON.stringify({ ok: true, idx, cols, drizzle, pubs, market }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
