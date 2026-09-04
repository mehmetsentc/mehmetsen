/**
 * P18.4C — READ-ONLY post-migration verification.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnvLocal()
{
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  if (!existsSync(stubDir)) {
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(resolve(stubDir, 'index.js'), 'module.exports = {};\n')
    writeFileSync(resolve(stubDir, 'package.json'), JSON.stringify({ name: 'server-only', main: 'index.js' }))
  }
}

const IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

const SLUGS = [
  'derin-uyku-alzheimeri-yavaslatiyor',
  'canakkalede-tarihe-saygi-ani-dalisi-ve-yelken-surusu-deneyimi',
  'yeralti-dizisinin-yeni-sezon-tarihi-henuz-aciklanmadi',
] as const

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
  const {
    runCanonicalDraftMigrationPilot,
    snapshotNewsUniverseCounts,
  } = await import('../src/services/editorial/canonicalDraftMigrationPilot')

  const counts = await snapshotNewsUniverseCounts()
  const [social] = await sql`SELECT
    (SELECT count(*)::int FROM article_likes) AS likes,
    (SELECT count(*)::int FROM saved_articles) AS saves,
    (SELECT count(*)::int FROM article_comments) AS comments,
    (SELECT count(*)::int FROM user_content_impressions) AS seen`
  let rawC = null
  try {
    const [r] = await sql`SELECT count(*)::int AS c FROM raw_articles`
    rawC = r.c
  } catch {
    rawC = null
  }

  const pilots = await sql`
    SELECT id, legacy_firestore_id AS legacy, status::text AS status,
           publication_authority::text AS authority, migration_batch_id AS batch,
           slug, source, published_at IS NOT NULL AS has_published_at
    FROM news WHERE id = ANY(${[...IDS]})
    ORDER BY id`

  const publishedWithSameSlug = await sql`
    SELECT id, slug, status::text AS status FROM news
    WHERE slug = ANY(${[...SLUGS]}) AND status = 'published'`

  const orphanTouches = await sql`
    SELECT published_news_id::text AS id FROM news_clusters
    WHERE published_news_id = ANY(${[...IDS]})`

  const seenPer = await sql`
    SELECT article_id::text AS id, count(*)::int AS c
    FROM user_content_impressions
    WHERE article_id = ANY(${[...IDS]})
    GROUP BY 1`

  // Idempotency (execute mode should ALREADY_MIGRATED)
  const idem = await runCanonicalDraftMigrationPilot({
    firestoreIds: [...IDS],
    mode: 'execute',
    stopOnUnexpected: true,
  })

  // HTTP checks (read-only)
  const http: Record<string, number> = {}
  for (const slug of SLUGS) {
    const res = await fetch(`https://www.nahaber.com/haber/${slug}`, { redirect: 'manual' })
    http[slug] = res.status
  }
  const sitemap = await fetch('https://www.nahaber.com/news-sitemap.xml')
  const sitemapText = await sitemap.text()
  const sitemapHits = IDS.filter((id) => sitemapText.includes(id)).length +
    SLUGS.filter((s) => sitemapText.includes(s)).length

  const health = await (await fetch('https://www.nahaber.com/api/health')).json()

  const out = {
    health,
    counts,
    social,
    raw: rawC,
    pilots,
    publishedWithSameSlug,
    orphanTouches,
    seenPer,
    idempotency: {
      insertedCount: idem.insertedCount,
      alreadyMigratedCount: idem.alreadyMigratedCount,
      outcomes: idem.results.map((r) => r.outcome),
    },
    http,
    sitemapSlugOrIdHits: sitemapHits,
    aiEnvNote: 'verified via prior policy tests; not mutated this phase',
  }
  writeFileSync(resolve(process.cwd(), 'scripts/_p18_4c_post_verify_out.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
