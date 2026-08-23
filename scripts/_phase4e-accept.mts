/**
 * Phase 4E acceptance helpers against Neon (no provider call unless mode=spend).
 * Modes: candidates | approve | observe | members | firewall-check
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

const mode = process.argv[2] || 'candidates'
const arg = process.argv[3] || ''
const outPath = process.argv[4] || `tmp-phase4e-${mode}.json`

async function main() {
  loadEnvLocal()
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const T4E = (existsSync('tmp-phase4e-T4E.txt') ? readFileSync('tmp-phase4e-T4E.txt', 'utf8').trim() : '') ||
    '2026-08-21T09:31:23.000Z'
  const HIST = JSON.parse(
    existsSync('tmp-phase4e-baseline.json')
      ? JSON.stringify(
          (JSON.parse(readFileSync('tmp-phase4e-baseline.json', 'utf8')).approved_ids || []).map(
            (r: any) => r.id
          )
        )
      : '[]'
  ) as string[]

  const out: Record<string, unknown> = { mode, at: new Date().toISOString(), T4E, HIST }

  if (mode === 'candidates') {
    out.candidates = await sql`
      SELECT c.id, c.canonical_title, c.editorial_decision, c.ai_eligibility, c.auto_draft_status,
        c.unique_source_count, c.article_count, c.primary_source_name, c.importance_score,
        c.cluster_confidence, c.city, c.district, c.created_at, c.updated_at, c.editorial_decided_at,
        c.published_news_id, c.content_fingerprint,
        coalesce(max(r.word_count),0)::int AS max_words,
        coalesce(avg(r.extraction_confidence),0)::float AS avg_conf,
        coalesce(avg(s.health_score),0)::float AS avg_health
      FROM news_clusters c
      LEFT JOIN raw_articles r ON r.cluster_id = c.id AND coalesce(r.is_exact_duplicate,0)=0
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE c.published_news_id IS NULL
        AND c.created_at > ${T4E}::timestamptz
        AND c.editorial_decision IN ('NONE','APPROVED_FOR_AI')
        AND c.id <> ALL(${HIST})
      GROUP BY c.id
      HAVING coalesce(max(r.word_count),0) >= 120
      ORDER BY
        (CASE WHEN c.unique_source_count >= 2 THEN 0 ELSE 1 END),
        c.unique_source_count DESC,
        coalesce(max(r.word_count),0) DESC,
        c.importance_score DESC,
        c.created_at DESC
      LIMIT 20
    `
  }

  if (mode === 'approve') {
    const id = arg
    if (!id) throw new Error('approve requires cluster id')
    const now = new Date().toISOString()
    await sql`
      UPDATE news_clusters
      SET editorial_decision = 'APPROVED_FOR_AI',
          editorial_decided_at = ${now}::timestamptz,
          editorial_decided_by = 'phase4e_acceptance',
          updated_at = ${now}::timestamptz
      WHERE id = ${id}
        AND published_news_id IS NULL
    `
    out.approved = await sql`
      SELECT id, canonical_title, editorial_decision, editorial_decided_at, unique_source_count,
        importance_score, cluster_confidence, city, auto_draft_status, ai_eligibility,
        primary_source_name, article_count, content_fingerprint
      FROM news_clusters WHERE id = ${id}
    `
  }

  if (mode === 'members') {
    const id = arg
    out.members = await sql`
      SELECT m.membership_role, m.is_canonical, m.is_independent_source,
        r.id AS article_id, r.title, r.word_count, r.extraction_confidence, r.cluster_role,
        s.name AS source_name, s.health_score, s.status AS source_status, s.quality_tier
      FROM cluster_memberships m
      JOIN raw_articles r ON r.id = m.article_id
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE m.cluster_id = ${id}
      ORDER BY (CASE WHEN m.membership_role='PRIMARY' THEN 0 ELSE 1 END), r.word_count DESC NULLS LAST
    `
  }

  if (mode === 'observe' || mode === 'firewall-check') {
    out.ledger = (
      await sql`SELECT coalesce(sum(actual_cost_usd),0)::float AS cost, count(*)::int AS n FROM crawler_ai_cost_ledger`
    )[0]
    out.jobs_by = await sql`SELECT status::text AS status, count(*)::int AS c FROM crawler_ai_jobs GROUP BY 1 ORDER BY 1`
    out.active = (
      await sql`SELECT count(*)::int AS c FROM crawler_ai_jobs WHERE status IN ('PENDING','RESERVED','PROCESSING')`
    )[0]
    out.recent_jobs = await sql`
      SELECT id, cluster_id, status, eligibility_status, failure_code, failure_reason,
        actual_cost_usd, estimated_cost_usd, actual_input_tokens, actual_output_tokens,
        model, provider, execution_id, editorial_news_id, created_at, completed_at,
        draft_snapshot is not null AS has_draft,
        (draft_snapshot->>'title') AS draft_title,
        cardinality(string_to_array(trim(coalesce(draft_snapshot->>'body','')), ' ')) AS body_words
      FROM crawler_ai_jobs
      ORDER BY created_at DESC LIMIT 10
    `
    out.recent_ledger = await sql`
      SELECT id, cluster_id, status, request_type, mode, reason, failure_code,
        actual_cost_usd, estimated_cost_usd, model, provider, input_tokens, output_tokens, timestamp
      FROM crawler_ai_cost_ledger ORDER BY timestamp DESC LIMIT 10
    `
    out.hist_jobs = await sql`
      SELECT cluster_id, count(*)::int AS c FROM crawler_ai_jobs
      WHERE cluster_id = ANY(${HIST}) GROUP BY 1
    `
    out.hist_ledger_after_T4E = await sql`
      SELECT cluster_id, count(*)::int AS c, coalesce(sum(actual_cost_usd),0)::float AS cost
      FROM crawler_ai_cost_ledger
      WHERE cluster_id = ANY(${HIST}) AND timestamp > ${T4E}::timestamptz
      GROUP BY 1
    `
    out.jobs_after_T4E = await sql`
      SELECT id, cluster_id, status, created_at, actual_cost_usd
      FROM crawler_ai_jobs WHERE created_at > ${T4E}::timestamptz ORDER BY created_at
    `
    if (arg) {
      out.cluster = await sql`
        SELECT id, canonical_title, editorial_decision, editorial_decided_at, auto_draft_status,
          ai_eligibility, unique_source_count, importance_score, cluster_confidence, city,
          primary_source_name, content_fingerprint, drafted_content_fingerprint,
          has_material_update, update_review_status, published_news_id
        FROM news_clusters WHERE id = ${arg}
      `
      out.cluster_jobs = await sql`
        SELECT id, status, eligibility_status, failure_code, actual_cost_usd, execution_id,
          editorial_news_id, created_at, completed_at,
          draft_snapshot is not null AS has_draft,
          (draft_snapshot->>'title') AS draft_title,
          cardinality(string_to_array(trim(coalesce(draft_snapshot->>'body','')), ' ')) AS body_words
        FROM crawler_ai_jobs WHERE cluster_id = ${arg} ORDER BY created_at
      `
    }
  }

  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  console.log('WROTE', outPath)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
