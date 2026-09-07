/**
 * P16.2B — READ-ONLY verification against real DB data.
 * Finds real clusters with 2+ independent sources whose event was published
 * to canonical `news`, then calls the actual resolveCanonicalNewsSources()
 * resolver (not a reimplementation) to prove it produces the expected
 * PRIMARY/SUPPORTING lineage. NO WRITES.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

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
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  const candidates = await sql`
    SELECT c.id AS cluster_id, c.published_news_id, c.unique_source_count, c.canonical_title
    FROM news_clusters c
    WHERE c.published_news_id IS NOT NULL
      AND c.unique_source_count >= 2
    ORDER BY c.last_seen_at DESC
    LIMIT 3
  `

  console.log(`Found ${candidates.length} candidate multi-source clusters with published_news_id set.\n`)

  const { resolveCanonicalNewsSources } = await import('../src/services/editorial/canonicalSourceProvenance.ts')

  for (const c of candidates) {
    console.log('='.repeat(70))
    console.log('cluster_id:', c.cluster_id)
    console.log('published_news_id:', c.published_news_id)
    console.log('unique_source_count (DB):', c.unique_source_count)
    console.log('canonical_title:', c.canonical_title)

    const resolved = await resolveCanonicalNewsSources(c.published_news_id)
    console.log('resolveCanonicalNewsSources() ->', JSON.stringify(resolved, null, 2))
  }

  if (candidates.length === 0) {
    console.log('No cluster currently has both unique_source_count >= 2 AND a non-null published_news_id.')
    console.log('Checking the two conditions separately (read-only) to explain why:')
    const multi = await sql`SELECT COUNT(*)::int AS n FROM news_clusters WHERE unique_source_count >= 2`
    const published = await sql`SELECT COUNT(*)::int AS n FROM news_clusters WHERE published_news_id IS NOT NULL`
    console.log('news_clusters with unique_source_count >= 2:', multi[0].n)
    console.log('news_clusters with published_news_id set:', published[0].n)
  }

  console.log('\nNO WRITES PERFORMED. Read-only verification complete.')
}

main().catch((e) => {
  console.error('READONLY VERIFY ERROR:', e)
  process.exit(1)
})
