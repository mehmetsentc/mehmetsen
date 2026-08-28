/**
 * Phase P12 Investigation Script
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

  // Check all tables
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `
  console.log('--- ALL TABLES ---')
  console.log(tables.map(t => t.table_name))

  // Financial & Marketplace baseline counts
  const financialCounts = await sql`
    SELECT 'payment_intents' AS k, count(*)::int AS c FROM payment_intents
    UNION ALL SELECT 'payment_transactions', count(*)::int FROM payment_transactions
    UNION ALL SELECT 'commercial_ledger_entries', count(*)::int FROM commercial_ledger_entries
    UNION ALL SELECT 'publisher_earnings', count(*)::int FROM publisher_earnings
  `
  console.log('--- FINANCIAL COUNTS ---')
  console.log(JSON.stringify(financialCounts, null, 2))

  const marketplaceCounts = await sql`
    SELECT 'advertiser_campaigns' AS k, count(*)::int AS c FROM advertiser_campaigns
    UNION ALL SELECT 'ad_booking_requests', count(*)::int FROM ad_booking_requests
    UNION ALL SELECT 'ad_bookings', count(*)::int FROM ad_bookings
  `
  console.log('--- MARKETPLACE COUNTS ---')
  console.log(JSON.stringify(marketplaceCounts, null, 2))

  // Check crawler / news article tables
  const newsTables = tables.filter(t => t.table_name.includes('news') || t.table_name.includes('article') || t.table_name.includes('content') || t.table_name.includes('crawler'))
  console.log('--- NEWS/CRAWLER TABLES ---', newsTables)

  // Check columns for news tables
  for (const t of newsTables) {
    const cols = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = ${t.table_name}
    `
    console.log(`COLS for ${t.table_name}:`, cols.map(c => c.column_name))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
