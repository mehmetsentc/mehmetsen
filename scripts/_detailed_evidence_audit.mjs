import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  try {
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
  } catch (e) {}
}

loadEnvLocal()

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  const sql = neon(url)

  console.log('--- 1. AUDIT OF THREE DRAFTS ---')
  const targetIds = ['wn7TDVNBOsaHWCELr5XS', '7Ek0kU6f1f75FKdgkGkq', '9K3iCNDXq88sspsWh9Kq']
  const drafts = await sql`
    SELECT n.id, n.title, n.category_id, n.source, n.source_url, n.status,
           nc.id as cluster_id, nc.primary_source_id, nc.primary_source_name, nc.article_count, nc.source_count
    FROM news n
    LEFT JOIN news_clusters nc ON nc.published_news_id = n.id
    WHERE n.id = ANY(${targetIds})
  `
  console.log('Target drafts from DB:', JSON.stringify(drafts, null, 2))

  console.log('--- 2. SUPPORTING SOURCES FOR TARGET CLUSTERS ---')
  for (const d of drafts) {
    const rawCount = await sql`
      SELECT count(*)::int as count FROM raw_articles WHERE cluster_id = ${d.cluster_id}
    `
    const rawSources = await sql`
      SELECT distinct ra.source_id, ns.name as source_name 
      FROM raw_articles ra
      LEFT JOIN news_sources ns ON ns.id = ra.source_id
      WHERE ra.cluster_id = ${d.cluster_id}
    `
    console.log(`Cluster ${d.cluster_id} (${d.id}): total raw articles = ${rawCount[0].count}, distinct sources =`, rawSources)
  }

  console.log('--- 3. AUDIT OF LOW OVERLAP ARTICLE IBeli7VLsE3OVfOKKRmu ---')
  const lowOverlap = await sql`
    SELECT n.id, n.title, n.status, n.published_at, n.source, n.source_url, n.author_id, n.author_display_name,
           nc.id as cluster_id, nc.primary_source_id, nc.primary_source_name, nc.editorial_decision, nc.editorial_decided_by, nc.editorial_decided_at
    FROM news n
    LEFT JOIN news_clusters nc ON nc.published_news_id = n.id
    WHERE n.id = 'IBeli7VLsE3OVfOKKRmu'
  `
  console.log('IBeli7VLsE3OVfOKKRmu full record:', JSON.stringify(lowOverlap, null, 2))

  console.log('--- 4. PUBLISHER OWNERSHIP / CLAIM STATUS ---')
  const pubList = await sql`
    SELECT id, name, slug, status, verification_status, claimed_at, verified_at
    FROM publishers
    WHERE name ILIKE '%guardian%' OR name ILIKE '%trt%' OR name ILIKE '%monde%' OR name ILIKE '%dw%' OR name ILIKE '%bbc%' OR slug = 'cumhuriyet'
  `
  console.log('Publisher claim states:', pubList)

  console.log('--- 5. SOCIAL & TELEMETRY OBSERVATIONS ---')
  const [socialLikes] = await sql`SELECT count(*)::int as count FROM article_likes`
  const [socialSaves] = await sql`SELECT count(*)::int as count FROM saved_articles`
  const [socialFollows] = await sql`SELECT count(*)::int as count FROM user_publisher_follows`
  const [socialComments] = await sql`SELECT count(*)::int as count FROM article_comments`
  const [socialEvents] = await sql`SELECT count(*)::int as count FROM social_events`
  const [impressions] = await sql`SELECT count(*)::int as count FROM user_content_impressions`
  console.log({ socialLikes, socialSaves, socialFollows, socialComments, socialEvents, impressions })

  const recentEvents = await sql`
    SELECT event_type, user_id, target_type, target_id, created_at
    FROM social_events
    ORDER BY created_at DESC
    LIMIT 10
  `
  console.log('Recent social events:', recentEvents)
}

main().catch(console.error)
