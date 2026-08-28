/**
 * Check 5 Real Publishers Details
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
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url!)

  const realSlugs = [
    'the-guardian-world-rss',
    'trt-haber-rss',
    'le-monde-rss',
    'deutsche-welle-rss',
    'bbc-world-rss',
  ]

  const data = await sql`
    SELECT p.id as publisher_id,
           p.name as publisher_name,
           p.slug as publisher_slug,
           p.primary_domain,
           p.status,
           p.verification_status,
           p.publisher_type,
           p.created_at,
           ps.source_id,
           ns.name as source_name,
           ns.domain as source_domain,
           ns.base_url as source_base_url,
           ns.status as source_status,
           ns.quality_tier as source_quality_tier,
           (SELECT count(*)::int FROM raw_articles ra WHERE ra.source_id = ps.source_id) as raw_articles_count,
           (SELECT count(*)::int FROM discovered_article_urls dau WHERE dau.source_id = ps.source_id) as discovered_urls_count,
           (SELECT count(*)::int FROM publisher_members pm WHERE pm.publisher_id = p.id) as member_count,
           (SELECT count(*)::int FROM publisher_claim_requests pcr WHERE pcr.publisher_id = p.id) as claim_count,
           (SELECT count(*)::int FROM publisher_feature_access pfa WHERE pfa.publisher_id = p.id AND pfa.enabled = true) as feature_grants_count
    FROM publishers p
    LEFT JOIN publisher_sources ps ON ps.publisher_id = p.id
    LEFT JOIN news_sources ns ON ns.id = ps.source_id
    WHERE p.slug = ANY(${realSlugs})
    ORDER BY p.slug ASC
  `

  console.log(JSON.stringify(data, null, 2))
}

main().catch(console.error)
