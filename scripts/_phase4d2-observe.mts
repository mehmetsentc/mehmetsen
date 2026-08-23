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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnvLocal()

const HIST = [
  'cl_7ca7b0c4-8234-4e0f-bc98-f77582c48799',
  'cl_6b54e643-329f-406b-bf34-ad45aa9d3632',
  'cl_713c7834-a506-4c50-8d45-32109c988edd',
  'cl_7ec4422d-8100-49c1-b356-67aee791b82d',
]

const mode = process.argv[2] || 'observe'
const outPath = process.argv[3] || 'tmp-phase4d2-watch.json'
const cutoff = process.argv[4] || ''
const approveId = process.argv[5] || ''

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const out: Record<string, unknown> = { mode, at: new Date().toISOString() }

  if (mode === 'observe' || mode === 'baseline' || mode === 'post_tick' || mode === 'watch') {
    const cost = await sql`SELECT coalesce(sum(actual_cost_usd),0)::float AS c, count(*)::int AS n FROM crawler_ai_cost_ledger`
    const jobs = await sql`SELECT count(*)::int AS c FROM crawler_ai_jobs`
    const jobsBy = await sql`SELECT status::text AS status, count(*)::int AS c FROM crawler_ai_jobs GROUP BY 1 ORDER BY 2 DESC`
    const drafts = await sql`SELECT count(*)::int AS c FROM raw_articles WHERE editorial_status = 'AI_DRAFT'`
    const published = await sql`SELECT count(*)::int AS c FROM raw_articles WHERE editorial_status = 'PUBLISHED'`
    const histJobs = await sql`
      SELECT cluster_id, count(*)::int AS c FROM crawler_ai_jobs
      WHERE cluster_id = ANY(${HIST})
      GROUP BY 1`
    const histLedger = await sql`
      SELECT cluster_id, count(*)::int AS c, coalesce(sum(actual_cost_usd),0)::float AS cost
      FROM crawler_ai_cost_ledger WHERE cluster_id = ANY(${HIST}) GROUP BY 1`
    const histState = await sql`
      SELECT id, editorial_decision, auto_draft_status, ai_eligibility, published_news_id, updated_at
      FROM news_clusters WHERE id = ANY(${HIST})`
    const latestDrafts = await sql`
      SELECT id, cluster_id, editorial_status, title, word_count, created_at
      FROM raw_articles WHERE editorial_status = 'AI_DRAFT'
      ORDER BY created_at DESC LIMIT 5`
    const recentLedger = await sql`
      SELECT id, cluster_id, status, request_type, mode, reason, failure_code,
             actual_cost_usd, estimated_cost_usd, model, provider,
             input_tokens, output_tokens, timestamp AS created_at
      FROM crawler_ai_cost_ledger ORDER BY timestamp DESC LIMIT 10`
    const recentJobs = await sql`
      SELECT id, cluster_id, status, created_at, updated_at
      FROM crawler_ai_jobs ORDER BY created_at DESC LIMIT 10`
    const timestamps = await sql`
      SELECT
        (SELECT max(discovered_at) FROM discovered_article_urls) AS latest_discovery,
        (SELECT max(fetched_at) FROM raw_articles) AS latest_extraction,
        (SELECT max(updated_at) FROM news_clusters) AS latest_cluster_update,
        (SELECT max(created_at) FROM news_clusters) AS latest_cluster_create`
    out.ledger_sum = (cost as any)[0]?.c
    out.ledger_rows = (cost as any)[0]?.n
    out.jobs_total = (jobs as any)[0]?.c
    out.jobs_by_status = jobsBy
    out.ai_draft_count = (drafts as any)[0]?.c
    out.published_count = (published as any)[0]?.c
    out.historical_jobs = histJobs
    out.historical_ledger = histLedger
    out.historical_state = histState
    out.latest_ai_drafts = latestDrafts
    out.recent_ledger = recentLedger
    out.recent_jobs = recentJobs
    out.timestamps = timestamps
  }

  if (mode === 'find_candidate') {
    const after = cutoff || new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    out.cutoff = after
    out.candidates = await sql`
      SELECT c.id, c.canonical_title AS title, c.editorial_decision, c.ai_eligibility,
             c.auto_draft_status, c.source_count, c.published_news_id, c.created_at, c.updated_at,
             count(r.id)::int AS raw_count,
             coalesce(max(r.word_count),0)::int AS max_word_count,
             coalesce(sum(r.word_count),0)::int AS sum_word_count
      FROM news_clusters c
      LEFT JOIN raw_articles r ON r.cluster_id = c.id
      WHERE c.created_at > ${after}::timestamptz
        AND c.editorial_decision = 'NONE'
        AND c.published_news_id IS NULL
        AND c.id <> ALL(${HIST})
      GROUP BY c.id
      HAVING coalesce(max(r.word_count),0) >= 80
      ORDER BY max(r.word_count) DESC, c.created_at DESC
      LIMIT 20`
  }

  if (mode === 'approve' && approveId) {
    if (HIST.includes(approveId)) throw new Error('refusing historical id')
    out.approved = await sql`
      UPDATE news_clusters
      SET editorial_decision = 'APPROVED_FOR_AI',
          editorial_decided_at = now(),
          editorial_decided_by = 'phase4d2_acceptance',
          approval_source = 'acceptance_operator',
          updated_at = now()
      WHERE id = ${approveId}
        AND editorial_decision = 'NONE'
        AND id <> ALL(${HIST})
      RETURNING id, canonical_title AS title, editorial_decision, editorial_decided_at,
                ai_eligibility, auto_draft_status, source_count, created_at`
  }

  if (mode === 'event_detail') {
    const clusterId = approveId
    out.cluster = await sql`
      SELECT id, canonical_title AS title, editorial_decision, editorial_decided_at,
             editorial_decided_by, approval_source, ai_eligibility, auto_draft_status,
             source_count, published_news_id, created_at, updated_at
      FROM news_clusters WHERE id = ${clusterId}`
    out.jobs = await sql`SELECT * FROM crawler_ai_jobs WHERE cluster_id = ${clusterId} ORDER BY created_at`
    out.ledger = await sql`
      SELECT id, cluster_id, status, request_type, mode, reason, failure_code,
             actual_cost_usd, estimated_cost_usd, model, provider,
             input_tokens, output_tokens, timestamp AS created_at
      FROM crawler_ai_cost_ledger WHERE cluster_id = ${clusterId} ORDER BY timestamp`
    out.drafts = await sql`
      SELECT id, cluster_id, editorial_status, title, word_count, created_at
      FROM raw_articles WHERE cluster_id = ${clusterId} AND editorial_status = 'AI_DRAFT'
      ORDER BY created_at DESC`
  }

  writeFileSync(resolve(process.cwd(), outPath), JSON.stringify(out, null, 2))
  console.log(JSON.stringify({ ok: true, mode, path: outPath, keys: Object.keys(out) }))
}
main().catch((e) => { console.error(String((e as any)?.message || e).slice(0, 400)); process.exit(1) })
