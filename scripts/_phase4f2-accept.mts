/**
 * Phase 4F.2 — Design A controlled continuous auto-draft acceptance helpers.
 * Modes: baseline | observe | fresh | event | jobs-after | sources | firewall
 * Read-mostly against Neon. Never prints secrets. No provider spend.
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

const mode = process.argv[2] || 'observe'
const arg = process.argv[3] || ''
const outPath = process.argv[4] || `tmp-phase4f2-${mode}.json`

const HIST_PROTECT = [
  'cl_b93c6db6-427a-46d8-81d3-0a27b83e73d4',
  'cl_c4d49acf-5625-41b2-bfd0-1f9dd8627a9d',
  'cl_f82807da-0345-4057-a870-9735d4e6e667',
  'cl_7ca7b0c4-8234-4e0f-bc98-f77582c48799',
  'cl_6b54e643-329f-406b-bf34-ad45aa9d3632',
  'cl_713c7834-a506-4c50-8d45-32109c988edd',
  'cl_7ec4422d-8100-49c1-b356-67aee791b82d',
  'cl_d1d3a875-1b20-47e7-9657-b0d27d363ebe',
]

async function main() {
  loadEnvLocal()
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const T4F2 =
    (existsSync('tmp-phase4f2-T4F2.txt')
      ? readFileSync('tmp-phase4f2-T4F2.txt', 'utf8').trim()
      : '') || new Date().toISOString()

  const out: Record<string, unknown> = {
    mode,
    at: new Date().toISOString(),
    T4F2,
    HIST_PROTECT,
  }

  if (mode === 'baseline' || mode === 'observe') {
    out.machine_eligible = (
      await sql`
      SELECT count(*)::int AS c FROM news_clusters
      WHERE machine_draft_eligibility = 'AUTO_DRAFT_ELIGIBLE'`
    )[0]
    out.approved_for_ai = (
      await sql`
      SELECT count(*)::int AS c FROM news_clusters
      WHERE editorial_decision = 'APPROVED_FOR_AI'`
    )[0]
    out.jobs_by = await sql`
      SELECT status::text AS status, count(*)::int AS c
      FROM crawler_ai_jobs GROUP BY 1 ORDER BY 1`
    out.active_jobs = (
      await sql`
      SELECT count(*)::int AS c FROM crawler_ai_jobs
      WHERE status IN ('PENDING','RESERVED','PROCESSING')`
    )[0]
    out.uncertain_jobs = (
      await sql`
      SELECT count(*)::int AS c FROM crawler_ai_jobs
      WHERE status IN ('PROCESSING','RESERVED')
         OR failure_code ILIKE '%UNCERTAIN%'
         OR failure_code ILIKE '%NO_AUTO_REPAY%'`
    )[0]
    out.ledger = (
      await sql`
      SELECT coalesce(sum(actual_cost_usd),0)::float AS cost, count(*)::int AS n
      FROM crawler_ai_cost_ledger
      WHERE actual_cost_usd IS NOT NULL`
    )[0]
    out.drafts_with_snapshot = (
      await sql`
      SELECT count(*)::int AS c FROM crawler_ai_jobs
      WHERE draft_snapshot IS NOT NULL`
    )[0]
    out.jobs_after_T4F2 = await sql`
      SELECT id, cluster_id, status::text AS status, eligibility_status,
        estimated_cost_usd, actual_cost_usd, failure_code, created_at, completed_at,
        provider, model, actual_input_tokens, actual_output_tokens, execution_id,
        editorial_news_id, (draft_snapshot IS NOT NULL) AS has_draft_snapshot
      FROM crawler_ai_jobs
      WHERE created_at > ${T4F2}::timestamptz
      ORDER BY created_at`
    out.ledger_after_T4F2 = await sql`
      SELECT id, cluster_id, status, request_type, actual_cost_usd, timestamp, job_id
      FROM crawler_ai_cost_ledger
      WHERE timestamp > ${T4F2}::timestamptz
      ORDER BY timestamp DESC LIMIT 30`
    out.hist_jobs_after = await sql`
      SELECT cluster_id, count(*)::int AS c FROM crawler_ai_jobs
      WHERE cluster_id = ANY(${HIST_PROTECT})
        AND created_at > ${T4F2}::timestamptz
      GROUP BY 1`
    out.hist_ledger_after = await sql`
      SELECT cluster_id, count(*)::int AS c,
        coalesce(sum(actual_cost_usd),0)::float AS cost
      FROM crawler_ai_cost_ledger
      WHERE cluster_id = ANY(${HIST_PROTECT})
        AND timestamp > ${T4F2}::timestamptz
      GROUP BY 1`
    out.crawler_freshness = (
      await sql`
      SELECT
        (SELECT max(created_at) FROM raw_articles) AS latest_discovery,
        (SELECT max(updated_at) FROM raw_articles WHERE word_count > 0) AS latest_extract,
        (SELECT max(created_at) FROM news_clusters) AS latest_cluster,
        (SELECT max(updated_at) FROM news_clusters) AS latest_cluster_update`
    )[0]
    out.pre_cutoff_auto_eligible = (
      await sql`
      SELECT count(*)::int AS c FROM news_clusters
      WHERE machine_draft_eligibility = 'AUTO_DRAFT_ELIGIBLE'
        AND created_at < ${T4F2}::timestamptz`
    )[0]
  }

  if (mode === 'fresh') {
    out.fresh = await sql`
      SELECT c.id, c.canonical_title, c.editorial_decision,
        c.machine_draft_eligibility, c.machine_draft_eligibility_reason,
        c.machine_draft_eligibility_at, c.ai_eligibility, c.auto_draft_status,
        c.unique_source_count, c.article_count, c.primary_source_name,
        c.importance_score, c.cluster_confidence, c.city, c.district,
        c.created_at, c.first_seen_at, c.latest_article_at, c.updated_at,
        c.published_news_id, c.content_fingerprint, c.drafted_content_fingerprint,
        c.has_material_update, c.update_review_status,
        coalesce(max(r.word_count),0)::int AS max_words,
        coalesce(avg(r.extraction_confidence),0)::float AS avg_conf,
        coalesce(avg(s.health_score),0)::float AS avg_health
      FROM news_clusters c
      LEFT JOIN raw_articles r ON r.cluster_id = c.id AND coalesce(r.is_exact_duplicate,0)=0
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE c.published_news_id IS NULL
        AND c.created_at >= ${T4F2}::timestamptz
        AND c.editorial_decision IN ('NONE','WATCHING','APPROVED_FOR_AI')
      GROUP BY c.id
      ORDER BY
        (CASE WHEN c.machine_draft_eligibility = 'AUTO_DRAFT_ELIGIBLE' THEN 0 ELSE 1 END),
        (CASE WHEN c.unique_source_count >= 2 THEN 0 ELSE 1 END),
        c.unique_source_count DESC,
        coalesce(max(r.word_count),0) DESC,
        c.created_at DESC
      LIMIT 25`
  }

  if (mode === 'event') {
    const id = arg
    if (!id) throw new Error('event requires cluster id')
    out.cluster = await sql`
      SELECT id, canonical_title, editorial_decision, editorial_decided_at, editorial_decided_by,
        machine_draft_eligibility, machine_draft_eligibility_reason, machine_draft_eligibility_at,
        machine_draft_eligibility_meta, ai_eligibility, ai_eligibility_reason, auto_draft_status,
        unique_source_count, article_count, primary_source_name, importance_score,
        cluster_confidence, city, district, region, country_code,
        created_at, first_seen_at, latest_article_at, updated_at,
        published_news_id, content_fingerprint, drafted_content_fingerprint,
        has_material_update, update_review_status, event_key
      FROM news_clusters WHERE id = ${id}`
    out.members = await sql`
      SELECT m.membership_role, m.is_canonical, m.is_independent_source,
        r.id AS article_id, r.title, r.word_count, r.extraction_confidence,
        r.created_at AS discovered_at, r.updated_at AS extracted_at,
        r.cluster_role, r.is_exact_duplicate,
        s.name AS source_name, s.health_score, s.status AS source_status, s.quality_tier
      FROM cluster_memberships m
      JOIN raw_articles r ON r.id = m.article_id
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE m.cluster_id = ${id}
      ORDER BY (CASE WHEN m.membership_role='PRIMARY' THEN 0 ELSE 1 END),
        r.word_count DESC NULLS LAST`
    out.jobs = await sql`
      SELECT id, status::text AS status, eligibility_status, blocked_reason,
        estimated_cost_usd, actual_cost_usd, failure_code, failure_reason,
        created_at, reserved_at, started_at, completed_at, updated_at,
        provider, model, actual_input_tokens, actual_output_tokens,
        execution_id, lease_owner, lease_expires_at, editorial_news_id,
        (draft_snapshot IS NOT NULL) AS has_draft_snapshot,
        CASE WHEN draft_snapshot IS NOT NULL THEN
          length(coalesce(draft_snapshot::text,''))
        ELSE 0 END AS draft_snapshot_chars,
        CASE WHEN draft_snapshot IS NOT NULL THEN
          coalesce((draft_snapshot->>'bodyWordCount')::int,
                   (draft_snapshot->>'body_word_count')::int,
                   0)
        ELSE 0 END AS body_words,
        CASE WHEN draft_snapshot IS NOT NULL THEN
          coalesce(draft_snapshot->>'headline', draft_snapshot->>'title')
        ELSE NULL END AS draft_title
      FROM crawler_ai_jobs WHERE cluster_id = ${id} ORDER BY created_at`
    out.ledger = await sql`
      SELECT id, job_id, status, request_type, actual_cost_usd, estimated_cost_usd,
        input_tokens, output_tokens, provider, model, timestamp, lane
      FROM crawler_ai_cost_ledger WHERE cluster_id = ${id} ORDER BY timestamp`
    out.draft_news = await sql`
      SELECT n.id, n.status, n.title, n.slug, n.created_at, n.published_at
      FROM news n
      WHERE n.id = (
        SELECT editorial_news_id FROM crawler_ai_jobs
        WHERE cluster_id = ${id} AND editorial_news_id IS NOT NULL
        ORDER BY completed_at DESC NULLS LAST
        LIMIT 1
      )`
  }

  if (mode === 'jobs-after') {
    out.jobs = await sql`
      SELECT j.id, j.cluster_id, j.status::text AS status, j.eligibility_status,
        j.estimated_cost_usd, j.actual_cost_usd,
        j.failure_code, j.created_at, j.completed_at, j.provider, j.model,
        j.actual_input_tokens, j.actual_output_tokens, j.execution_id, j.editorial_news_id,
        (j.draft_snapshot IS NOT NULL) AS has_draft_snapshot,
        c.canonical_title, c.editorial_decision, c.machine_draft_eligibility,
        c.unique_source_count, c.primary_source_name
      FROM crawler_ai_jobs j
      LEFT JOIN news_clusters c ON c.id = j.cluster_id
      WHERE j.created_at > ${T4F2}::timestamptz
      ORDER BY j.created_at`
  }

  if (mode === 'sources') {
    out.by_status = await sql`
      SELECT status::text AS status, count(*)::int AS c
      FROM news_sources GROUP BY 1 ORDER BY 1`
    out.total = (await sql`SELECT count(*)::int AS c FROM news_sources`)[0]
    out.pause_reasons = await sql`
      SELECT coalesce(last_pause_reason,'null') AS reason, count(*)::int AS c
      FROM news_sources
      WHERE status = 'PAUSED'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 15`
  }

  if (mode === 'firewall') {
    out.pre_eligible_jobs = await sql`
      SELECT j.id, j.cluster_id, j.status, j.created_at, c.created_at AS event_created
      FROM crawler_ai_jobs j
      JOIN news_clusters c ON c.id = j.cluster_id
      WHERE j.created_at > ${T4F2}::timestamptz
        AND c.created_at < ${T4F2}::timestamptz`
    out.pre_approved_jobs = await sql`
      SELECT j.id, j.cluster_id, j.status, j.created_at
      FROM crawler_ai_jobs j
      JOIN news_clusters c ON c.id = j.cluster_id
      WHERE j.created_at > ${T4F2}::timestamptz
        AND c.editorial_decision = 'APPROVED_FOR_AI'
        AND c.created_at < ${T4F2}::timestamptz`
  }

  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
