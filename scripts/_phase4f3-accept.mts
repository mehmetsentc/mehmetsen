/**
 * Phase 4F.3 — shadow economics / pre-spend / concurrency acceptance helpers.
 * Modes: baseline | observe | shadow-funnel | event2-audit | sources | firewall | env
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
const outPath = process.argv[4] || `tmp-phase4f3-${mode}.json`

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

const EVENT2_CLUSTER = 'cl_326b706c-f8ff-4326-9d81-835957f2b5bb'
const EVENT2_JOB = 'aij_9425fc11-3105-4fe2-b08c-398ef4339725'

async function main() {
  loadEnvLocal()
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const T4F3 =
    (existsSync('tmp-phase4f3-T4F3.txt')
      ? readFileSync('tmp-phase4f3-T4F3.txt', 'utf8').trim()
      : '') || new Date().toISOString()

  const out: Record<string, unknown> = {
    mode,
    at: new Date().toISOString(),
    T4F3,
    HIST_PROTECT,
  }

  if (mode === 'env') {
    const keys = [
      'CRAWLER_AI_MODE',
      'CRAWLER_AI_DISPATCH_ENABLED',
      'CRAWLER_AI_PROVIDER_ENABLED',
      'CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER',
      'LEGACY_DIRECT_AI_ENABLED',
      'DEEPSEEK_NEWS_MODEL',
      'DEEPSEEK_INPUT_COST_PER_1M',
      'DEEPSEEK_OUTPUT_COST_PER_1M',
      'AI_MAX_COST_PER_EVENT_USD',
      'AI_MAX_DRAFTS_PER_HOUR',
      'AI_MAX_DRAFTS_PER_DAY',
      'AI_MAX_DAILY_COST_USD',
      'AI_MAX_MONTHLY_COST_USD',
      'CRAWLER_AI_MAX_CONCURRENT_JOBS',
      'CRAWLER_AI_MAX_EVENTS_PER_TICK',
      'CRAWLER_AI_ACCEPTANCE_MAX_EVENTS',
      'CRAWLER_AI_ACCEPTANCE_MAX_REQUESTS',
      'CRAWLER_AI_AUTO_PUBLISH',
    ]
    const env: Record<string, string> = {}
    for (const k of keys) {
      const v = process.env[k]
      if (k.includes('KEY') || k.includes('SECRET') || k.includes('TOKEN')) {
        env[k] = v ? `PRESENT(len=${v.length})` : 'ABSENT'
      } else if (k === 'DEEPSEEK_API_KEY') {
        env[k] = v ? `PRESENT(len=${v.length})` : 'ABSENT'
      } else {
        env[k] = v ?? 'UNSET'
      }
    }
    env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
      ? `PRESENT(len=${process.env.DEEPSEEK_API_KEY.length})`
      : 'ABSENT'
    out.env = env
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
    out.ledger_after_T4F3 = await sql`
      SELECT id, cluster_id, status, request_type, actual_cost_usd, timestamp, job_id
      FROM crawler_ai_cost_ledger
      WHERE timestamp > ${T4F3}::timestamptz
      ORDER BY timestamp DESC LIMIT 30`
    out.jobs_after_T4F3 = await sql`
      SELECT id, cluster_id, status::text AS status, failure_code, actual_cost_usd, created_at
      FROM crawler_ai_jobs
      WHERE created_at > ${T4F3}::timestamptz
      ORDER BY created_at`
    out.hist_jobs_after = await sql`
      SELECT cluster_id, count(*)::int AS c FROM crawler_ai_jobs
      WHERE cluster_id = ANY(${HIST_PROTECT})
        AND created_at > ${T4F3}::timestamptz
      GROUP BY 1`
    out.crawler_freshness = (
      await sql`
      SELECT
        (SELECT max(created_at) FROM raw_articles) AS latest_discovery,
        (SELECT max(updated_at) FROM raw_articles WHERE word_count > 0) AS latest_extract,
        (SELECT max(created_at) FROM news_clusters) AS latest_cluster,
        (SELECT max(updated_at) FROM news_clusters) AS latest_cluster_update`
    )[0]
    try {
      out.shadow_decisions_after = (
        await sql`
        SELECT count(*)::int AS c FROM crawler_ai_shadow_decisions
        WHERE evaluated_at > ${T4F3}::timestamptz`
      )[0]
    } catch {
      out.shadow_decisions_after = { available: false, displayTr: 'Veri alınamadı' }
    }
  }

  if (mode === 'shadow-funnel') {
    try {
      out.by_outcome = await sql`
        SELECT prespend_outcome, count(*)::int AS c
        FROM crawler_ai_shadow_decisions
        WHERE evaluated_at > ${T4F3}::timestamptz
        GROUP BY 1 ORDER BY c DESC`
      out.by_tier = await sql`
        SELECT economic_tier, count(*)::int AS c
        FROM crawler_ai_shadow_decisions
        WHERE evaluated_at > ${T4F3}::timestamptz
        GROUP BY 1 ORDER BY 1`
      out.by_action = await sql`
        SELECT action, count(*)::int AS c
        FROM crawler_ai_shadow_decisions
        WHERE evaluated_at > ${T4F3}::timestamptz
        GROUP BY 1 ORDER BY 1`
      out.cost_est = (
        await sql`
        SELECT
          count(*)::int AS n,
          count(*) FILTER (WHERE action = 'WOULD_DISPATCH')::int AS would_dispatch,
          count(*) FILTER (WHERE action = 'WOULD_BLOCK')::int AS would_block,
          coalesce(sum(estimated_cost_usd) FILTER (WHERE action = 'WOULD_DISPATCH' AND cost_known = 1),0)::float AS would_spend_usd,
          coalesce(sum(estimated_cost_usd) FILTER (WHERE action = 'WOULD_BLOCK' AND cost_known = 1),0)::float AS prevented_usd,
          count(*) FILTER (WHERE cost_known = 0)::int AS cost_unknown
        FROM crawler_ai_shadow_decisions
        WHERE evaluated_at > ${T4F3}::timestamptz`
      )[0]
      out.distinct_clusters = (
        await sql`
        SELECT count(DISTINCT cluster_id)::int AS c
        FROM crawler_ai_shadow_decisions
        WHERE evaluated_at > ${T4F3}::timestamptz`
      )[0]
    } catch (e) {
      out.error = e instanceof Error ? e.message : String(e)
      out.available = false
      out.displayTr = 'Veri alınamadı'
    }
  }

  if (mode === 'event2-audit') {
    const clusterId = arg || EVENT2_CLUSTER
    out.cluster = await sql`
      SELECT id, canonical_title, editorial_decision, machine_draft_eligibility,
        machine_draft_eligibility_reason, machine_draft_eligibility_meta,
        ai_eligibility, unique_source_count, importance_score, content_fingerprint
      FROM news_clusters WHERE id = ${clusterId}`
    out.job = await sql`
      SELECT id, status, failure_code, failure_reason, estimated_cost_usd, actual_cost_usd,
        actual_input_tokens, actual_output_tokens, execution_id,
        (draft_snapshot IS NOT NULL) AS has_draft,
        validation_snapshot
      FROM crawler_ai_jobs WHERE id = ${EVENT2_JOB} OR cluster_id = ${clusterId}
      ORDER BY created_at DESC LIMIT 3`
    out.members = await sql`
      SELECT m.membership_role, m.is_canonical, m.is_independent_source,
        r.title, r.word_count, r.extraction_confidence,
        s.name AS source_name, s.health_score, s.quality_tier
      FROM cluster_memberships m
      JOIN raw_articles r ON r.id = m.article_id
      LEFT JOIN news_sources s ON s.id = m.source_id
      WHERE m.cluster_id = ${clusterId}`
    const snap = (out.job as Array<{ validation_snapshot?: unknown }>)?.[0]?.validation_snapshot
    out.schema_audit = classifySchemaFailure(snap)
  }

  if (mode === 'sources') {
    out.paused_by_reason = await sql`
      SELECT coalesce(last_pause_reason,'null') AS reason, count(*)::int AS c
      FROM news_sources
      WHERE status = 'PAUSED'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 20`
    out.paused_total = (
      await sql`SELECT count(*)::int AS c FROM news_sources WHERE status = 'PAUSED'`
    )[0]
    out.status_counts = await sql`
      SELECT status::text AS status, count(*)::int AS c
      FROM news_sources GROUP BY 1 ORDER BY 1`
  }

  if (mode === 'firewall') {
    out.pre_eligible_jobs = await sql`
      SELECT id, cluster_id, status, created_at FROM crawler_ai_jobs
      WHERE created_at > ${T4F3}::timestamptz
        AND eligibility_status = 'AUTO_DRAFT_ELIGIBLE'
      ORDER BY created_at DESC LIMIT 20`
    out.new_ledger_spend = (
      await sql`
      SELECT coalesce(sum(actual_cost_usd),0)::float AS cost, count(*)::int AS n
      FROM crawler_ai_cost_ledger
      WHERE timestamp > ${T4F3}::timestamptz AND actual_cost_usd IS NOT NULL`
    )[0]
  }

  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

function classifySchemaFailure(snap: unknown): Record<string, unknown> {
  if (!snap || typeof snap !== 'object') {
    return {
      preventability: 'C',
      note: 'No validation_snapshot persisted — cannot prove field-level cause from evidence alone.',
      safeNormalize: false,
      wouldPrespendHaveBlocked: false,
      class: 'INCONCLUSIVE_NO_SNAPSHOT',
    }
  }
  const s = snap as Record<string, unknown>
  const issues = Array.isArray(s.issues) ? (s.issues as Array<Record<string, unknown>>) : []
  const codes = issues.map((i) => String(i.code || i.message || '')).filter(Boolean)
  const joined = codes.join(' ').toLowerCase()

  // A: deterministic pre-spend / pack normalize would have avoided paid call
  // B: safe post-parse normalize could salvage without re-call
  // C: model semantic failure — not safely preventable without paid repair
  // D: infra / unknown
  if (/insufficient_source|body_too_short|thin/.test(joined)) {
    return {
      preventability: 'A',
      class: 'MATERIAL_OR_LENGTH',
      codes,
      safeNormalize: false,
      wouldPrespendHaveBlocked: true,
      note: 'Pre-spend / material gate could block before DeepSeek.',
    }
  }
  if (/not_json|json_parse|trailing|markdown_fence/.test(joined)) {
    return {
      preventability: 'B',
      class: 'PARSE_SHAPE',
      codes,
      safeNormalize: true,
      wouldPrespendHaveBlocked: false,
      note: 'Safe deterministic JSON fence/strip normalize only — no fabricate.',
    }
  }
  if (/missing_field|type_mismatch|enum|required/.test(joined)) {
    return {
      preventability: 'B',
      class: 'SCHEMA_SHAPE',
      codes,
      safeNormalize: true,
      wouldPrespendHaveBlocked: false,
      note: 'Optional safe coerce of known fields only; never invent facts.',
    }
  }
  if (/grounding|hallucin|unsupported_claim/.test(joined)) {
    return {
      preventability: 'C',
      class: 'SEMANTIC',
      codes,
      safeNormalize: false,
      wouldPrespendHaveBlocked: false,
      note: 'Semantic grounding failure — no paid repair in 4F.3.',
    }
  }
  return {
    preventability: codes.length ? 'C' : 'D',
    class: 'OTHER_OR_EMPTY_ISSUES',
    codes,
    safeNormalize: false,
    wouldPrespendHaveBlocked: false,
    note: 'Persisted issues present but not mapped to safe normalize.',
    rawIssueCount: issues.length,
    ok: s.ok ?? null,
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
