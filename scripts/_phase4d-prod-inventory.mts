/**
 * Phase 4D production inventory / verification helpers against Neon.
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
  const u = new URL(process.env.DATABASE_URL!)
  console.log('DB_HOST', u.hostname, 'DB', u.pathname)

  const out: Record<string, unknown> = {}

  async function c(label: string, q: Promise<any>) {
    try {
      const r = await q
      out[label] = r[0]?.c ?? r
    } catch (e: any) {
      out[label] = `ERR:${String(e?.message || e).slice(0, 120)}`
    }
  }

  await c('raw_articles', sql`SELECT count(*)::int AS c FROM raw_articles`)
  await c('news_clusters', sql`SELECT count(*)::int AS c FROM news_clusters`)
  await c('discovered_article_urls', sql`SELECT count(*)::int AS c FROM discovered_article_urls`)
  await c('news_sources', sql`SELECT count(*)::int AS c FROM news_sources`)
  await c('sources_ACTIVE', sql`SELECT count(*)::int AS c FROM news_sources WHERE status = 'ACTIVE'`)
  await c('sources_PAUSED', sql`SELECT count(*)::int AS c FROM news_sources WHERE status = 'PAUSED'`)
  await c(
    'urls_PENDING_FETCH',
    sql`SELECT count(*)::int AS c FROM discovered_article_urls WHERE status = 'PENDING_FETCH'`,
  )
  await c(
    'clusters_APPROVED_FOR_AI',
    sql`SELECT count(*)::int AS c FROM news_clusters WHERE editorial_decision = 'APPROVED_FOR_AI'`,
  )
  await c(
    'clusters_AI_READY',
    sql`SELECT count(*)::int AS c FROM news_clusters WHERE ai_eligibility = 'ELIGIBLE' AND editorial_decision = 'APPROVED_FOR_AI'`,
  )
  await c(
    'clusters_AI_ELIGIBLE',
    sql`SELECT count(*)::int AS c FROM news_clusters WHERE ai_eligibility = 'ELIGIBLE'`,
  )
  await c(
    'raw_AI_DRAFT',
    sql`SELECT count(*)::int AS c FROM raw_articles WHERE editorial_status = 'AI_DRAFT'`,
  )
  await c(
    'raw_PUBLISHED',
    sql`SELECT count(*)::int AS c FROM raw_articles WHERE editorial_status = 'PUBLISHED'`,
  )
  await c(
    'clusters_with_published_news',
    sql`SELECT count(*)::int AS c FROM news_clusters WHERE published_news_id IS NOT NULL`,
  )
  await c('ai_jobs_total', sql`SELECT count(*)::int AS c FROM crawler_ai_jobs`)
  await c(
    'ai_jobs_active',
    sql`SELECT count(*)::int AS c FROM crawler_ai_jobs WHERE status IN ('PENDING','RESERVED','PROCESSING')`,
  )
  await c(
    'ai_jobs_failed',
    sql`SELECT count(*)::int AS c FROM crawler_ai_jobs WHERE status = 'FAILED'`,
  )
  await c('ledger_rows', sql`SELECT count(*)::int AS c FROM crawler_ai_cost_ledger`)
  await c(
    'ledger_sum_actual',
    sql`SELECT coalesce(sum(actual_cost_usd),0)::float AS c FROM crawler_ai_cost_ledger`,
  )
  await c(
    'multi_source_clusters',
    sql`SELECT count(*)::int AS c FROM news_clusters WHERE source_count >= 2`,
  )
  await c(
    'audit_rows',
    sql`SELECT count(*)::int AS c FROM crawler_editorial_audit`,
  )

  out.editorial_decision = await sql`
    SELECT editorial_decision, count(*)::int AS c
    FROM news_clusters GROUP BY 1 ORDER BY 2 DESC
  `
  out.raw_editorial_status = await sql`
    SELECT editorial_status, count(*)::int AS c
    FROM raw_articles GROUP BY 1 ORDER BY 2 DESC
  `
  out.url_status = await sql`
    SELECT status::text, count(*)::int AS c
    FROM discovered_article_urls GROUP BY 1 ORDER BY 2 DESC
  `
  out.source_status = await sql`
    SELECT status::text, count(*)::int AS c FROM news_sources GROUP BY 1 ORDER BY 2 DESC
  `

  out.phase4d_cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'news_clusters'
      AND column_name IN ('content_fingerprint','drafted_content_fingerprint','auto_draft_status')
    ORDER BY 1
  `
  out.ledger_4d_cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'crawler_ai_cost_ledger'
      AND column_name IN ('reason','mode','failure_code')
    ORDER BY 1
  `
  out.active_job_uidx = await sql`
    SELECT indexname FROM pg_indexes WHERE indexname = 'crawler_ai_jobs_cluster_active_uidx'
  `

  out.timestamps = await sql`
    SELECT
      (SELECT max(discovered_at) FROM discovered_article_urls) AS latest_discovery,
      (SELECT max(fetched_at) FROM raw_articles) AS latest_extraction,
      (SELECT max(updated_at) FROM news_clusters) AS latest_cluster_update,
      (SELECT max(created_at) FROM news_clusters) AS latest_cluster_create,
      (SELECT max(timestamp) FROM crawler_ai_cost_ledger) AS latest_ledger
  `

  out.ledger_breakdown = await sql`
    SELECT status, request_type, count(*)::int AS n,
           coalesce(sum(actual_cost_usd),0)::float AS cost
    FROM crawler_ai_cost_ledger
    GROUP BY 1,2 ORDER BY 1,2
  `

  // canary draft evidence from 4C.4
  out.canary_draft_raw = await sql`
    SELECT id, editorial_status, cluster_id, title, word_count, created_at
    FROM raw_articles
    WHERE id LIKE 'draft_canary_%' OR editorial_status = 'AI_DRAFT'
    ORDER BY created_at DESC LIMIT 10
  `

  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
