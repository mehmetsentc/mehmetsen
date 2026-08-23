/**
 * Phase 4D production verification queries (read-mostly).
 * Usage: npx tsx scripts/_phase4d-verify.mts
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
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const out: Record<string, unknown> = {}

  out.counts = {
    raw: (await sql`SELECT count(*)::int AS c FROM raw_articles`)[0].c,
    clusters: (await sql`SELECT count(*)::int AS c FROM news_clusters`)[0].c,
    urls: (await sql`SELECT count(*)::int AS c FROM discovered_article_urls`)[0].c,
    sources_active: (
      await sql`SELECT count(*)::int AS c FROM news_sources WHERE status = 'ACTIVE'`
    )[0].c,
    approved: (
      await sql`SELECT count(*)::int AS c FROM news_clusters WHERE editorial_decision = 'APPROVED_FOR_AI'`
    )[0].c,
    jobs: (await sql`SELECT count(*)::int AS c FROM crawler_ai_jobs`)[0].c,
    jobs_active: (
      await sql`SELECT count(*)::int AS c FROM crawler_ai_jobs WHERE status IN ('PENDING','RESERVED','PROCESSING')`
    )[0].c,
    ledger: (await sql`SELECT count(*)::int AS c FROM crawler_ai_cost_ledger`)[0].c,
    ledger_sum: (
      await sql`SELECT coalesce(sum(actual_cost_usd),0)::float AS c FROM crawler_ai_cost_ledger`
    )[0].c,
    raw_published: (
      await sql`SELECT count(*)::int AS c FROM raw_articles WHERE editorial_status = 'PUBLISHED'`
    )[0].c,
    raw_new: (
      await sql`SELECT count(*)::int AS c FROM raw_articles WHERE editorial_status = 'NEW'`
    )[0].c,
  }

  out.timestamps = (
    await sql`
      SELECT
        (SELECT max(discovered_at) FROM discovered_article_urls) AS latest_discovery,
        (SELECT max(fetched_at) FROM raw_articles) AS latest_extraction,
        (SELECT max(updated_at) FROM news_clusters) AS latest_cluster_update,
        (SELECT max(created_at) FROM news_clusters) AS latest_cluster_create,
        (SELECT max(timestamp) FROM crawler_ai_cost_ledger) AS latest_ledger
    `
  )[0]

  // Recent flow window (last 10 min)
  out.recent_10m = (
    await sql`
      SELECT
        (SELECT count(*)::int FROM discovered_article_urls WHERE discovered_at > now() - interval '10 minutes') AS discovered,
        (SELECT count(*)::int FROM raw_articles WHERE fetched_at > now() - interval '10 minutes') AS extracted,
        (SELECT count(*)::int FROM news_clusters WHERE created_at > now() - interval '10 minutes') AS clusters_created,
        (SELECT count(*)::int FROM crawler_ai_jobs WHERE created_at > now() - interval '10 minutes') AS jobs_created,
        (SELECT count(*)::int FROM crawler_ai_cost_ledger WHERE timestamp > now() - interval '10 minutes') AS ledger_new
    `
  )[0]

  // RSS snippet vs full body samples
  out.rss_vs_body = await sql`
    SELECT id, source_id, title,
           length(coalesce(description,'')) AS desc_len,
           word_count,
           rss_snippet_used_as_body,
           left(coalesce(article_body_text,''), 80) AS body_prefix
    FROM raw_articles
    WHERE fetched_at > now() - interval '2 hours'
      AND word_count > 100
    ORDER BY fetched_at DESC
    LIMIT 8
  `

  // Same URL dedup: url_hash uniqueness / duplicate statuses
  out.url_hash_dupes = (
    await sql`
      SELECT count(*)::int AS dupe_groups FROM (
        SELECT url_hash FROM discovered_article_urls
        GROUP BY url_hash HAVING count(*) > 1
      ) t
    `
  )[0]

  out.raw_url_hash_dupes = (
    await sql`
      SELECT count(*)::int AS dupe_groups FROM (
        SELECT url_hash FROM raw_articles
        WHERE coalesce(is_exact_duplicate, 0) = 0
        GROUP BY url_hash HAVING count(*) > 1
      ) t
    `
  )[0]

  // Multi-source same-event examples
  out.multi_source_examples = await sql`
    SELECT id, canonical_title, source_count, unique_source_count,
           primary_source_name, editorial_decision, ai_eligibility,
           auto_draft_status, article_count
    FROM news_clusters
    WHERE source_count >= 2
    ORDER BY last_seen_at DESC NULLS LAST
    LIMIT 5
  `

  // Similar but distinct: same signature tokens prefix / nearby titles?
  out.approved_detail = await sql`
    SELECT id, canonical_title, editorial_decision, ai_eligibility,
           ai_eligibility_reason, source_count, unique_source_count,
           auto_draft_status, published_news_id, update_review_status
    FROM news_clusters
    WHERE editorial_decision = 'APPROVED_FOR_AI'
    ORDER BY editorial_decided_at DESC NULLS LAST
    LIMIT 10
  `

  // Primary/supporting memberships for one multi-source
  const multi = out.multi_source_examples as any[]
  if (multi?.[0]?.id) {
    const cid = multi[0].id
    out.memberships = await sql`
      SELECT m.cluster_id, m.article_id, m.source_id, m.is_canonical,
             m.membership_role, m.is_independent_source, m.similarity_score,
             r.title, r.word_count, r.editorial_status, r.cluster_role,
             s.name AS source_name
      FROM cluster_memberships m
      LEFT JOIN raw_articles r ON r.id = m.article_id
      LEFT JOIN news_sources s ON s.id = m.source_id
      WHERE m.cluster_id = ${cid}
      LIMIT 20
    `
  }

  // Media pollution sample
  out.media_sample = await sql`
    SELECT id, title, word_count, primary_image_method, image_candidate_count,
           image_rejected_count, media_status,
           left(coalesce(main_image_url,''), 100) AS main_image
    FROM raw_articles
    WHERE fetched_at > now() - interval '3 hours'
      AND main_image_url IS NOT NULL
    ORDER BY fetched_at DESC
    LIMIT 6
  `

  // Phase 4D columns populated?
  out.auto_draft_status_dist = await sql`
    SELECT auto_draft_status, count(*)::int AS c
    FROM news_clusters
    GROUP BY 1 ORDER BY 2 DESC
    LIMIT 20
  `

  // Idempotency index exists
  out.active_job_uidx = await sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE indexname = 'crawler_ai_jobs_cluster_active_uidx'
  `

  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
