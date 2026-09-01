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

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  const sql = neon(url)

  console.log('=== P17.7D: POST-DEPLOYMENT PRODUCTION INVENTORY AUDIT ===')

  // 1. Total news rows breakdown
  const newsRows = await sql`
    SELECT id, title, status, category_id, published_at
    FROM news
    ORDER BY published_at DESC NULLS LAST
  `

  const published = newsRows.filter(r => r.status === 'published')
  const draft = newsRows.filter(r => r.status === 'draft')
  const archived = newsRows.filter(r => r.status === 'archived')

  console.log(`Total news rows in PostgreSQL: ${newsRows.length}`)
  console.log(`Published news rows: ${published.length}`)
  console.log(`Draft (Editorial Hold) rows: ${draft.length}`)
  console.log(`Archived rows: ${archived.length}`)

  // 2. Feed eligible query (matching FeedCandidateService publishedStatusWhere)
  const feedEligibleRows = await sql`
    SELECT id, title, status, category_id, published_at
    FROM news
    WHERE (status = 'published' OR lower(status::text) in ('published', 'active'))
      AND status NOT IN ('archived', 'draft', 'pending', 'banned')
      AND published_at IS NOT NULL
      AND published_at <= NOW()
      AND id NOT LIKE 'test_%'
      AND coalesce(title, '') NOT LIKE '[%TEST%]'
  `

  console.log(`Feed eligible count in Production: ${feedEligibleRows.length}`)
  console.log('Feed eligible articles:', feedEligibleRows)

  // 3. User feature access rows
  const ufaRows = await sql`
    SELECT user_id, feature_key, enabled
    FROM user_feature_access
    ORDER BY user_id, feature_key
  `
  console.log(`User feature access total rows: ${ufaRows.length}`)
  const distinctUsers = new Set(ufaRows.map(r => r.user_id))
  console.log(`Distinct override users: ${distinctUsers.size} (UIDs: ${Array.from(distinctUsers)})`)
}

run().catch(console.error)
