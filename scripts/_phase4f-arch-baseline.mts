/**
 * Phase 4F — read-only architecture + inventory probe (no mode/provider/spend).
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
  const out: Record<string, unknown> = {
    at: new Date().toISOString(),
    architecture: {
      design: 'B',
      path: 'fresh → eligibility/AI_READY → human APPROVED_FOR_AI → CONTROLLED_AUTO_DRAFT enqueue → worker',
      evidence: [
        'canCreateAutoDraftJob requires editorialDecision === APPROVED_FOR_AI (NOT_APPROVED_FOR_AI otherwise)',
        'listApprovedCandidates scans only editorialDecision=APPROVED_FOR_AI',
        'evaluateAutoDraftGate may return AI_READY without APPROVED_FOR_AI; spend still blocked',
        'no auto-approve path in codebase',
      ],
      continuousAutomationWithoutHumanApproval: false,
      stopBeforePaidExecution: true,
    },
  }

  out.drafts_with_snapshot = (
    await sql`SELECT count(*)::int AS c FROM crawler_ai_jobs WHERE draft_snapshot IS NOT NULL`
  )[0]
  out.active_jobs = (
    await sql`
    SELECT count(*)::int AS c FROM crawler_ai_jobs
    WHERE status IN ('PENDING','RESERVED','PROCESSING')`
  )[0]
  out.jobs_by = await sql`
    SELECT status::text AS status, count(*)::int AS c
    FROM crawler_ai_jobs GROUP BY 1 ORDER BY 1`
  out.ledger = (
    await sql`
    SELECT coalesce(sum(actual_cost_usd),0)::float AS cost, count(*)::int AS n
    FROM crawler_ai_cost_ledger
    WHERE actual_cost_usd IS NOT NULL`
  )[0]
  out.none_watching_or_eligible_6h = (
    await sql`
    SELECT count(*)::int AS c FROM news_clusters
    WHERE published_news_id IS NULL
      AND editorial_decision = 'NONE'
      AND ai_eligibility IN ('ELIGIBLE','HIGH_PRIORITY','WATCHING')
      AND created_at > now() - interval '6 hours'`
  )[0]
  out.approved_after_t4e1 = (
    await sql`
    SELECT id, canonical_title, editorial_decided_at, editorial_decided_by,
      ai_eligibility, unique_source_count, auto_draft_status
    FROM news_clusters
    WHERE editorial_decision = 'APPROVED_FOR_AI'
      AND coalesce(editorial_decided_at, created_at) > '2026-08-21T10:20:19.000Z'::timestamptz
    ORDER BY editorial_decided_at DESC NULLS LAST
    LIMIT 20`
  )
  out.fresh_multi_source_none_6h = await sql`
    SELECT c.id, c.canonical_title, c.ai_eligibility, c.unique_source_count,
      c.importance_score, c.created_at, c.city,
      coalesce(max(r.word_count),0)::int AS max_words
    FROM news_clusters c
    LEFT JOIN raw_articles r ON r.cluster_id = c.id AND coalesce(r.is_exact_duplicate,0)=0
    WHERE c.published_news_id IS NULL
      AND c.editorial_decision = 'NONE'
      AND c.created_at > now() - interval '6 hours'
      AND c.unique_source_count >= 2
    GROUP BY c.id
    HAVING coalesce(max(r.word_count),0) >= 120
    ORDER BY c.unique_source_count DESC, max(r.word_count) DESC
    LIMIT 10`

  const path = 'tmp-phase4f-arch-baseline.json'
  writeFileSync(path, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  console.log('WROTE', path)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
