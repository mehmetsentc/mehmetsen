/**
 * Phase 4D.4 — read-only prod verification (no AI).
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

  const job = await sql`
    SELECT id, status, editorial_news_id, actual_cost_usd, execution_id,
      draft_snapshot is not null as has_draft,
      (draft_snapshot->>'title') as title,
      (draft_snapshot->>'status') as draft_status,
      cardinality(string_to_array(trim(coalesce(draft_snapshot->>'body','')), ' ')) as body_words
    FROM crawler_ai_jobs
    WHERE id = 'aij_ce713b7a-c100-455b-a53b-bda4688c4073'
  `
  const cluster = await sql`
    SELECT id, published_news_id, auto_draft_status
    FROM news_clusters
    WHERE id = 'cl_b93c6db6-427a-46d8-81d3-0a27b83e73d4'
  `
  const ledger = await sql`
    SELECT coalesce(sum(actual_cost_usd),0)::float as total,
      count(*)::int as n,
      max(timestamp) as latest
    FROM crawler_ai_cost_ledger
  `
  const recent = await sql`
    SELECT
      (SELECT count(*)::int FROM crawler_ai_jobs WHERE created_at > now() - interval '2 hours') as jobs_2h,
      (SELECT count(*)::int FROM crawler_ai_cost_ledger WHERE timestamp > now() - interval '2 hours') as ledger_2h,
      (SELECT count(*)::int FROM discovered_article_urls WHERE discovered_at > now() - interval '30 minutes') as disc_30m,
      (SELECT count(*)::int FROM raw_articles WHERE fetched_at > now() - interval '30 minutes') as ext_30m,
      (SELECT count(*)::int FROM news_clusters WHERE created_at > now() - interval '30 minutes') as cl_30m,
      (SELECT count(*)::int FROM crawler_ai_jobs WHERE status IN ('PENDING','RESERVED','PROCESSING')) as active_jobs
  `
  const jobsBy = await sql`
    SELECT status, count(*)::int as c FROM crawler_ai_jobs GROUP BY status ORDER BY status
  `

  const out = { at: new Date().toISOString(), job, cluster, ledger, recent, jobsBy }
  writeFileSync('tmp-phase4d4-verify.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
