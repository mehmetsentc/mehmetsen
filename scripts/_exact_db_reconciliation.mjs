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

  console.log('--- RECONCILIATION COUNTS ---')
  const [totalNews] = await sql`SELECT count(*)::int as count FROM news`
  const [pubNews] = await sql`SELECT count(*)::int as count FROM news WHERE status = 'published'`
  const [draftNews] = await sql`SELECT count(*)::int as count FROM news WHERE status = 'draft'`
  const [archNews] = await sql`SELECT count(*)::int as count FROM news WHERE status = 'archived'`
  const [rawArticles] = await sql`SELECT count(*)::int as count FROM raw_articles`
  const [newsClusters] = await sql`SELECT count(*)::int as count FROM news_clusters`
  const [clusterMemberships] = await sql`SELECT count(*)::int as count FROM cluster_memberships`
  const [newsSources] = await sql`SELECT count(*)::int as count FROM news_sources`
  const [publishers] = await sql`SELECT count(*)::int as count FROM publishers`
  const [publisherSources] = await sql`SELECT count(*)::int as count FROM publisher_sources`

  console.log('news total:', totalNews.count)
  console.log('news published:', pubNews.count)
  console.log('news draft:', draftNews.count)
  console.log('news archived:', archNews.count)
  console.log('raw_articles:', rawArticles.count)
  console.log('news_clusters:', newsClusters.count)
  console.log('cluster_memberships:', clusterMemberships.count)
  console.log('news_sources:', newsSources.count)
  console.log('publishers:', publishers.count)
  console.log('publisher_sources:', publisherSources.count)

  const [pubLinked] = await sql`
    SELECT count(*)::int as count FROM news n JOIN news_clusters nc ON nc.published_news_id = n.id WHERE n.status = 'published'
  `
  const [draftLinked] = await sql`
    SELECT count(*)::int as count FROM news n JOIN news_clusters nc ON nc.published_news_id = n.id WHERE n.status = 'draft'
  `
  const [draftMissingCluster] = await sql`
    SELECT count(*)::int as count FROM news n LEFT JOIN news_clusters nc ON nc.published_news_id = n.id WHERE n.status = 'draft' AND nc.id IS NULL
  `
  const [pubMissingCluster] = await sql`
    SELECT count(*)::int as count FROM news n LEFT JOIN news_clusters nc ON nc.published_news_id = n.id WHERE n.status = 'published' AND nc.id IS NULL
  `

  console.log('published news linked to cluster:', pubLinked.count)
  console.log('draft news linked to cluster:', draftLinked.count)
  console.log('draft news missing cluster:', draftMissingCluster.count)
  console.log('published news missing cluster:', pubMissingCluster.count)

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
  console.log('feed eligible:', feedEligibleRows.length)

  const highOverlapWithoutRights = await sql`
    SELECT n.id, n.title
    FROM news n
    JOIN news_clusters nc ON nc.published_news_id = n.id
    WHERE n.status = 'published'
      AND (n.status = 'published' OR lower(n.status::text) in ('published', 'active'))
      AND n.status NOT IN ('archived', 'draft', 'pending', 'banned')
      AND n.id NOT LIKE 'test_%'
      AND coalesce(n.title, '') NOT LIKE '[%TEST%]'
      AND n.id != 'IBeli7VLsE3OVfOKKRmu'
  `
  console.log('HIGH_OVERLAP_WITHOUT_RIGHTS feed eligible:', highOverlapWithoutRights.length)

  const testEligible = await sql`
    SELECT n.id, n.title
    FROM news n
    WHERE (n.status = 'published' OR lower(n.status::text) in ('published', 'active'))
      AND (n.id LIKE 'test_%' OR coalesce(n.title, '') LIKE '[%TEST%]' OR n.id = 'XUEhKFwUCqoOgytboSIq')
  `
  console.log('test/internal feed eligible:', testEligible.length)

  const ufaRows = await sql`
    SELECT user_id, feature_key, enabled FROM user_feature_access ORDER BY user_id, feature_key
  `
  console.log('user_feature_access total rows:', ufaRows.length)
  console.log('user_feature_access rows:', ufaRows)

  const testArt01Count = await sql`
    SELECT count(*)::int as count FROM news WHERE id = 'test_art_01'
  `
  console.log('test_art_01 persisted count in news:', testArt01Count[0].count)

  const xueCount = await sql`
    SELECT id, title, status, published_at FROM news WHERE id = 'XUEhKFwUCqoOgytboSIq'
  `
  console.log('XUEhKFwUCqoOgytboSIq record:', xueCount)
}

main().catch(console.error)
