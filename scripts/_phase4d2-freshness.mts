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

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const out: Record<string, unknown> = {}

  out.auto_draft_status = await sql`
    SELECT auto_draft_status::text AS auto_draft_status, count(*)::int AS c
    FROM news_clusters GROUP BY 1 ORDER BY 2 DESC
  `

  out.ai_ready_approved = await sql`
    SELECT id, canonical_title AS title, editorial_decision, editorial_decided_at,
           ai_eligibility, auto_draft_status, source_count, published_news_id,
           created_at, updated_at
    FROM news_clusters
    WHERE editorial_decision = 'APPROVED_FOR_AI' AND ai_eligibility = 'ELIGIBLE'
    ORDER BY updated_at DESC
  `

  out.cluster_cl_7ec4422d = await sql`
    SELECT id, canonical_title AS title, editorial_decision, editorial_decided_at,
           ai_eligibility, auto_draft_status, source_count, published_news_id,
           created_at, updated_at
    FROM news_clusters
    WHERE id LIKE 'cl_7ec4422d%'
  `

  out.cluster_cl_7ec4422d_word_counts = await sql`
    SELECT r.id AS raw_id, r.cluster_id, r.word_count, r.editorial_status, r.title, r.created_at
    FROM raw_articles r
    WHERE r.cluster_id LIKE 'cl_7ec4422d%'
    ORDER BY r.created_at DESC
    LIMIT 20
  `

  out.ai_ready_with_word_stats = await sql`
    SELECT c.id, c.canonical_title AS title, c.editorial_decision, c.ai_eligibility,
           c.auto_draft_status, c.source_count,
           count(r.id)::int AS raw_count,
           coalesce(sum(r.word_count),0)::int AS sum_word_count,
           max(r.word_count)::int AS max_word_count
    FROM news_clusters c
    LEFT JOIN raw_articles r ON r.cluster_id = c.id
    WHERE c.editorial_decision = 'APPROVED_FOR_AI' AND c.ai_eligibility = 'ELIGIBLE'
    GROUP BY c.id, c.canonical_title, c.editorial_decision, c.ai_eligibility, c.auto_draft_status, c.source_count
  `

  out.recent_clusters_2h = await sql`
    SELECT id, canonical_title AS title, editorial_decision, ai_eligibility,
           auto_draft_status, source_count, created_at
    FROM news_clusters
    WHERE created_at > now() - interval '2 hours'
    ORDER BY created_at DESC
    LIMIT 50
  `
  out.recent_clusters_2h_count = Array.isArray(out.recent_clusters_2h) ? out.recent_clusters_2h.length : 0

  out.ledger_token_cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crawler_ai_cost_ledger'
      AND (column_name ILIKE '%token%' OR column_name ILIKE '%cost%' OR column_name IN ('model','provider','status','actual_cost_usd'))
    ORDER BY 1
  `

  const tokenCols = (out.ledger_token_cols as { column_name: string }[]).map((r) => r.column_name)
  const hasInput = tokenCols.includes('input_tokens')
  const hasOutput = tokenCols.includes('output_tokens')

  if (hasInput && hasOutput) {
    out.ledger_succeeded_rows = await sql`
      SELECT id, cluster_id, status, request_type, mode, reason, failure_code,
             actual_cost_usd, estimated_cost_usd, model, provider,
             input_tokens, output_tokens, timestamp AS created_at
      FROM crawler_ai_cost_ledger
      WHERE status = 'SUCCEEDED'
      ORDER BY timestamp DESC
      LIMIT 10
    `
    out.ledger_target_cost_row = await sql`
      SELECT id, cluster_id, status, request_type, mode,
             actual_cost_usd, estimated_cost_usd, model, provider,
             input_tokens, output_tokens, timestamp AS created_at
      FROM crawler_ai_cost_ledger
      WHERE status = 'SUCCEEDED'
        AND model ILIKE '%deepseek%flash%'
        AND abs(actual_cost_usd - 0.0037752) < 0.00001
      ORDER BY timestamp DESC
      LIMIT 5
    `
  } else {
    out.ledger_succeeded_rows = await sql`
      SELECT id, cluster_id, status, request_type, mode, reason, failure_code,
             actual_cost_usd, estimated_cost_usd, model, provider, timestamp AS created_at
      FROM crawler_ai_cost_ledger
      WHERE status = 'SUCCEEDED'
      ORDER BY timestamp DESC
      LIMIT 10
    `
    out.ledger_target_cost_row = await sql`
      SELECT *
      FROM crawler_ai_cost_ledger
      WHERE status = 'SUCCEEDED'
        AND abs(actual_cost_usd - 0.0037752) < 0.00001
      ORDER BY timestamp DESC
      LIMIT 5
    `
  }

  // reverse-check math if tokens present
  const rows = (out.ledger_target_cost_row as any[]) || []
  const succeeded = (out.ledger_succeeded_rows as any[]) || []
  const checkRows = rows.length ? rows : succeeded.filter((r) => r.model && String(r.model).includes('flash'))
  out.ledger_reverse_check = checkRows.map((r) => {
    const tin = Number(r.input_tokens)
    const tout = Number(r.output_tokens)
    const expected = (Number.isFinite(tin) && Number.isFinite(tout))
      ? (tin / 1e6) * 0.44 + (tout / 1e6) * 1.32
      : null
    return {
      id: r.id,
      model: r.model,
      actual_cost_usd: r.actual_cost_usd,
      input_tokens: r.input_tokens ?? null,
      output_tokens: r.output_tokens ?? null,
      expected_at_0_44_1_32: expected,
      matches_within_1e_6: expected != null ? Math.abs(Number(r.actual_cost_usd) - expected) < 1e-6 : null,
    }
  })

  const path = resolve(process.cwd(), 'tmp-phase4d2-freshness.json')
  writeFileSync(path, JSON.stringify(out, null, 2))
  console.log(JSON.stringify({
    ok: true,
    path,
    auto_draft: out.auto_draft_status,
    ai_ready_count: (out.ai_ready_approved as any[])?.length,
    cl_found: (out.cluster_cl_7ec4422d as any[])?.length,
    recent_2h: out.recent_clusters_2h_count,
    token_cols: tokenCols,
    reverse_check: out.ledger_reverse_check,
  }))
}
main().catch((e) => { console.error(String((e as any)?.message || e).slice(0, 500)); process.exit(1) })
