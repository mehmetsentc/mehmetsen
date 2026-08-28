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

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY 1`

  const tableSet = new Set(tables.map((t) => t.table_name))

  const userList = await sql`
    SELECT firebase_uid, email, username, display_name, role, created_at
    FROM users
    ORDER BY created_at ASC
    LIMIT 20`

  const userProfilesCount = tableSet.has('user_profiles') ? (await sql`SELECT count(*)::int as c FROM user_profiles`)[0].c : 0
  const followsCount = tableSet.has('user_publisher_follows') ? (await sql`SELECT count(*)::int as c FROM user_publisher_follows`)[0].c : 0
  const likesCount = tableSet.has('article_likes') ? (await sql`SELECT count(*)::int as c FROM article_likes`)[0].c : 0
  const savesCount = tableSet.has('saved_articles') ? (await sql`SELECT count(*)::int as c FROM saved_articles`)[0].c : 0
  const commentsCount = tableSet.has('article_comments') ? (await sql`SELECT count(*)::int as c FROM article_comments`)[0].c : 0
  const impressionsCount = tableSet.has('user_content_impressions') ? (await sql`SELECT count(*)::int as c FROM user_content_impressions`)[0].c : 0
  const interestScoresCount = tableSet.has('user_interest_scores') ? (await sql`SELECT count(*)::int as c FROM user_interest_scores`)[0].c : 0
  const affinityCount = tableSet.has('user_publisher_affinity') ? (await sql`SELECT count(*)::int as c FROM user_publisher_affinity`)[0].c : 0
  const preferencesCount = tableSet.has('user_feed_preferences') ? (await sql`SELECT count(*)::int as c FROM user_feed_preferences`)[0].c : 0

  const pfaCount = tableSet.has('publisher_feature_access') ? (await sql`SELECT count(*)::int as c FROM publisher_feature_access`)[0].c : 0
  const ufaCount = tableSet.has('user_feature_access') ? (await sql`SELECT count(*)::int as c FROM user_feature_access`)[0].c : 0

  // Also check publishers
  const publisherList = await sql`
    SELECT id, slug, name, verification_status, status
    FROM publishers
    WHERE slug IN ('the-guardian', 'trt-haber', 'le-monde', 'dw-turkce', 'bbc-turkce')
       OR verification_status = 'VERIFIED'
    LIMIT 20`

  console.log(JSON.stringify({
    ok: true,
    tables: Array.from(tableSet),
    userList,
    counts: {
      userProfilesCount,
      followsCount,
      likesCount,
      savesCount,
      commentsCount,
      impressionsCount,
      interestScoresCount,
      affinityCount,
      preferencesCount,
      pfaCount,
      ufaCount
    },
    publisherList
  }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
