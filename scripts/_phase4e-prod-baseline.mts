/**
 * Phase 4E — production baseline inventory (read-only). No mode/provider changes.
 * Usage: npx tsx scripts/_phase4e-prod-baseline.mts [out.json]
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
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

async function main() {
  loadEnvLocal()
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const out: Record<string, unknown> = { at: new Date().toISOString(), stage: 'baseline' }

  const q = async (label: string, promise: Promise<any>) => {
    try {
      out[label] = await promise
    } catch (e: any) {
      out[label] = { error: String(e?.message || e).slice(0, 200) }
    }
  }

  await q(
    'counts',
    sql`
    SELECT
      (SELECT count(*)::int FROM raw_articles) AS raw_articles,
      (SELECT count(*)::int FROM news_clusters) AS news_clusters,
      (SELECT count(*)::int FROM discovered_article_urls) AS discovered_urls,
      (SELECT count(*)::int FROM news_sources) AS news_sources,
      (SELECT count(*)::int FROM raw_articles WHERE editorial_status = 'PUBLISHED') AS raw_published,
      (SELECT count(*)::int FROM news_clusters WHERE published_news_id IS NOT NULL) AS clusters_published,
      (SELECT count(*)::int FROM news_clusters WHERE editorial_decision = 'APPROVED_FOR_AI') AS approved_for_ai,
      (SELECT count(*)::int FROM crawler_ai_jobs) AS ai_jobs_total,
      (SELECT count(*)::int FROM crawler_ai_jobs WHERE status IN ('PENDING','RESERVED','PROCESSING')) AS ai_jobs_active,
      (SELECT count(*)::int FROM crawler_ai_jobs WHERE status = 'COMPLETED') AS ai_jobs_completed,
      (SELECT count(*)::int FROM crawler_ai_jobs WHERE status = 'FAILED') AS ai_jobs_failed,
      (SELECT coalesce(sum(actual_cost_usd),0)::float FROM crawler_ai_cost_ledger) AS ledger_sum_actual
  `
  )

  await q(
    'sources_by_status',
    sql`SELECT status::text AS status, count(*)::int AS c FROM news_sources GROUP BY 1 ORDER BY 2 DESC`
  )
  await q(
    'pause_reasons',
    sql`
    SELECT coalesce(nullif(trim(last_pause_reason),''), 'bilinmiyor') AS reason, count(*)::int AS c
    FROM news_sources
    WHERE status IN ('PAUSED','DEGRADED')
    GROUP BY 1 ORDER BY 2 DESC LIMIT 15
  `
  )

  await q(
    'approved_ids',
    sql`
    SELECT id, editorial_decided_at, updated_at, created_at, auto_draft_status, ai_eligibility,
      unique_source_count, importance_score, city, canonical_title
    FROM news_clusters
    WHERE editorial_decision = 'APPROVED_FOR_AI'
    ORDER BY coalesce(editorial_decided_at, updated_at) DESC
    LIMIT 50
  `
  )

  await q(
    'timestamps',
    sql`
    SELECT
      (SELECT max(discovered_at) FROM discovered_article_urls) AS latest_discovery,
      (SELECT max(fetched_at) FROM raw_articles) AS latest_extraction,
      (SELECT max(updated_at) FROM news_clusters) AS latest_cluster_update,
      (SELECT max(created_at) FROM news_clusters) AS latest_cluster_create,
      (SELECT max(timestamp) FROM crawler_ai_cost_ledger) AS latest_ledger,
      (SELECT max(created_at) FROM crawler_ai_jobs) AS latest_job
  `
  )

  await q(
    'freshness_windows',
    sql`
    SELECT
      (SELECT count(*)::int FROM discovered_article_urls WHERE discovered_at > now() - interval '30 minutes') AS disc_30m,
      (SELECT count(*)::int FROM discovered_article_urls WHERE discovered_at > now() - interval '2 hours') AS disc_2h,
      (SELECT count(*)::int FROM raw_articles WHERE fetched_at > now() - interval '30 minutes') AS ext_30m,
      (SELECT count(*)::int FROM raw_articles WHERE fetched_at > now() - interval '2 hours') AS ext_2h,
      (SELECT count(*)::int FROM news_clusters WHERE created_at > now() - interval '30 minutes') AS cl_30m,
      (SELECT count(*)::int FROM news_clusters WHERE created_at > now() - interval '2 hours') AS cl_2h,
      (SELECT count(*)::int FROM news_clusters WHERE unique_source_count >= 2 AND created_at > now() - interval '24 hours') AS multi_24h,
      (SELECT count(*)::int FROM news_clusters WHERE auto_draft_status = 'AI_READY') AS ai_ready_status
  `
  )

  await q(
    'latency_sample',
    sql`
    SELECT
      avg(extract(epoch from (ra.fetched_at - d.discovered_at))) AS avg_disc_to_ext_sec,
      percentile_cont(0.5) within group (order by extract(epoch from (ra.fetched_at - d.discovered_at))) AS p50_disc_to_ext_sec,
      count(*)::int AS n
    FROM raw_articles ra
    JOIN discovered_article_urls d ON d.id = ra.discovered_url_id
    WHERE ra.fetched_at > now() - interval '6 hours'
      AND d.discovered_at IS NOT NULL
      AND ra.fetched_at > d.discovered_at
  `
  )

  await q(
    'jobs_by_status',
    sql`SELECT status::text AS status, count(*)::int AS c FROM crawler_ai_jobs GROUP BY 1 ORDER BY 1`
  )

  await q(
    'today_metrics',
    sql`
    SELECT
      (SELECT count(*)::int FROM discovered_article_urls WHERE discovered_at >= date_trunc('day', now() AT TIME ZONE 'UTC')) AS urls_today,
      (SELECT count(*)::int FROM raw_articles WHERE fetched_at >= date_trunc('day', now() AT TIME ZONE 'UTC')) AS extracted_today,
      (SELECT count(*)::int FROM news_clusters WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')) AS events_today,
      (SELECT count(*)::int FROM crawler_ai_jobs WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')) AS jobs_today,
      (SELECT count(*)::int FROM crawler_ai_jobs WHERE status='COMPLETED' AND completed_at >= date_trunc('day', now() AT TIME ZONE 'UTC')) AS drafts_today,
      (SELECT count(*)::int FROM crawler_ai_jobs WHERE status='FAILED' AND coalesce(completed_at, updated_at) >= date_trunc('day', now() AT TIME ZONE 'UTC')) AS failures_today,
      (SELECT coalesce(sum(actual_cost_usd),0)::float FROM crawler_ai_cost_ledger WHERE timestamp >= date_trunc('day', now() AT TIME ZONE 'UTC')) AS cost_today,
      (SELECT coalesce(sum(actual_cost_usd),0)::float FROM crawler_ai_cost_ledger WHERE timestamp >= date_trunc('month', now() AT TIME ZONE 'UTC')) AS cost_month
  `
  )

  await q(
    'multi_source_examples',
    sql`
    SELECT id, canonical_title, unique_source_count, article_count, primary_source_name,
      city, importance_score, cluster_confidence, ai_eligibility, editorial_decision, created_at
    FROM news_clusters
    WHERE unique_source_count >= 2
      AND created_at > now() - interval '24 hours'
    ORDER BY created_at DESC
    LIMIT 8
  `
  )

  await q(
    'schema_phase4e',
    sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'news_clusters'
      AND column_name IN (
        'content_fingerprint','drafted_content_fingerprint','auto_draft_status',
        'has_material_update','update_review_status'
      )
    ORDER BY 1
  `
  )

  const path = resolve(process.cwd(), process.argv[2] || 'tmp-phase4e-baseline.json')
  writeFileSync(path, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  console.log('WROTE', path)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
