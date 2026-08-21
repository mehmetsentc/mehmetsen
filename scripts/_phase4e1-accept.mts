/**
 * Phase 4E.1 — production enqueue acceptance helpers (Neon read / reversible cancel).
 * Modes: baseline | observe | fresh | jobs-after | cancel-pending | env-safe
 * No paid provider calls.
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}

const mode = process.argv[2] || 'observe'
const arg = process.argv[3] || ''
const outPath = process.argv[4] || `tmp-phase4e1-${mode}.json`

const HIST = [
  'cl_b93c6db6-427a-46d8-81d3-0a27b83e73d4',
  'cl_c4d49acf-5625-41b2-bfd0-1f9dd8627a9d',
  'cl_f82807da-0345-4057-a870-9735d4e6e667',
  'cl_7ca7b0c4-8234-4e0f-bc98-f77582c48799',
  'cl_6b54e643-329f-406b-bf34-ad45aa9d3632',
  'cl_713c7834-a506-4c50-8d45-32109c988edd',
  'cl_7ec4422d-8100-49c1-b356-67aee791b82d',
  'cl_d1d3a875-1b20-47e7-9657-b0d27d363ebe', // 4E Event1 — protect, no regen
]

async function main() {
  loadEnvLocal()
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const T4E1 =
    (existsSync('tmp-phase4e1-T4E1.txt')
      ? readFileSync('tmp-phase4e1-T4E1.txt', 'utf8').trim()
      : '') || new Date().toISOString()

  const out: Record<string, unknown> = {
    mode,
    at: new Date().toISOString(),
    T4E1,
    HIST,
  }

  if (mode === 'baseline' || mode === 'observe') {
    out.jobs_by = await sql`
      SELECT status::text AS status, count(*)::int AS c
      FROM crawler_ai_jobs GROUP BY 1 ORDER BY 1`
    out.active = (
      await sql`
      SELECT count(*)::int AS c FROM crawler_ai_jobs
      WHERE status IN ('PENDING','RESERVED','PROCESSING')`
    )[0]
    out.ledger = (
      await sql`
      SELECT coalesce(sum(actual_cost_usd),0)::float AS cost, count(*)::int AS n
      FROM crawler_ai_cost_ledger
      WHERE actual_cost_usd IS NOT NULL`
    )[0]
    out.jobs_after_T4E1 = await sql`
      SELECT id, cluster_id, status::text AS status, eligibility_status,
        estimated_cost_usd, actual_cost_usd, failure_code, created_at, completed_at
      FROM crawler_ai_jobs
      WHERE created_at > ${T4E1}::timestamptz
      ORDER BY created_at`
    out.hist_jobs_after = await sql`
      SELECT cluster_id, count(*)::int AS c FROM crawler_ai_jobs
      WHERE cluster_id = ANY(${HIST})
        AND created_at > ${T4E1}::timestamptz
      GROUP BY 1`
    out.ledger_after = await sql`
      SELECT id, cluster_id, status, request_type, actual_cost_usd, timestamp
      FROM crawler_ai_cost_ledger
      WHERE timestamp > ${T4E1}::timestamptz
      ORDER BY timestamp DESC LIMIT 20`
  }

  if (mode === 'fresh') {
    out.fresh = await sql`
      SELECT c.id, c.canonical_title, c.editorial_decision, c.ai_eligibility, c.auto_draft_status,
        c.unique_source_count, c.article_count, c.primary_source_name, c.importance_score,
        c.cluster_confidence, c.city, c.editorial_decided_at, c.created_at, c.published_news_id,
        c.has_material_update, c.update_review_status,
        coalesce(max(r.word_count),0)::int AS max_words,
        coalesce(avg(r.extraction_confidence),0)::float AS avg_conf,
        coalesce(avg(s.health_score),0)::float AS avg_health
      FROM news_clusters c
      LEFT JOIN raw_articles r ON r.cluster_id = c.id AND coalesce(r.is_exact_duplicate,0)=0
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE c.published_news_id IS NULL
        AND c.editorial_decided_at > ${T4E1}::timestamptz
        AND c.editorial_decision = 'APPROVED_FOR_AI'
        AND c.id <> ALL(${HIST})
      GROUP BY c.id
      ORDER BY c.editorial_decided_at DESC
      LIMIT 15`
  }

  if (mode === 'jobs-after') {
    out.jobs = await sql`
      SELECT j.id, j.cluster_id, j.status, j.eligibility_status, j.estimated_cost_usd, j.actual_cost_usd,
        j.failure_code, j.created_at, j.completed_at, c.canonical_title, c.unique_source_count, c.primary_source_name
      FROM crawler_ai_jobs j
      LEFT JOIN news_clusters c ON c.id = j.cluster_id
      WHERE j.created_at > ${T4E1}::timestamptz
      ORDER BY j.created_at`
  }

  if (mode === 'cancel-pending') {
    const id = arg
    if (!id) throw new Error('cancel-pending requires job id')
    const now = new Date().toISOString()
    out.updated = await sql`
      UPDATE crawler_ai_jobs
      SET status = 'FAILED',
          failure_code = 'CANCELLED_NO_PROVIDER_EVIDENCE',
          failure_reason = 'phase4e1_enqueue_proof_retain_audit_no_spend',
          completed_at = ${now}::timestamptz,
          updated_at = ${now}::timestamptz
      WHERE id = ${id}
        AND status = 'PENDING'
      RETURNING id, cluster_id, status, failure_code, failure_reason, created_at, completed_at`
  }

  if (mode === 'cluster') {
    const id = arg
    out.cluster = await sql`
      SELECT id, canonical_title, editorial_decision, editorial_decided_at, auto_draft_status,
        ai_eligibility, unique_source_count, importance_score, cluster_confidence, city,
        primary_source_name, published_news_id, has_material_update, update_review_status
      FROM news_clusters WHERE id = ${id}`
    out.members = await sql`
      SELECT m.membership_role, m.is_canonical, m.is_independent_source,
        r.word_count, r.extraction_confidence, r.title,
        s.name AS source_name, s.health_score
      FROM cluster_memberships m
      JOIN raw_articles r ON r.id = m.article_id
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE m.cluster_id = ${id}
      ORDER BY (CASE WHEN m.membership_role='PRIMARY' THEN 0 ELSE 1 END), r.word_count DESC NULLS LAST`
    out.jobs = await sql`
      SELECT id, status, eligibility_status, estimated_cost_usd, actual_cost_usd,
        failure_code, created_at, completed_at
      FROM crawler_ai_jobs WHERE cluster_id = ${id} ORDER BY created_at`
  }

  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
