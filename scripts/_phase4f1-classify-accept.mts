/**
 * Phase 4F.1 — zero-cost production acceptance classify (MODE OFF).
 * Writes machine_draft_* only. NEVER touches editorial_decision / APPROVED_FOR_AI.
 * Never creates AI jobs. Never calls providers.
 *
 * Modes: baseline | classify | observe
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  evaluateAutoDraftGate,
  toMachineDraftEligibility,
  buildMachineEligibilityMeta,
} from '../src/services/crawler/autoDraft/eligibility'

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
const outPath = process.argv[3] || `tmp-phase4f1-${mode}.json`

async function main() {
  loadEnvLocal()
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const now = new Date()
  const out: Record<string, unknown> = { mode, at: now.toISOString() }

  out.jobs_active = (
    await sql`SELECT count(*)::int AS c FROM crawler_ai_jobs WHERE status IN ('PENDING','RESERVED','PROCESSING')`
  )[0]
  out.jobs_by = await sql`SELECT status::text AS status, count(*)::int AS c FROM crawler_ai_jobs GROUP BY 1 ORDER BY 1`
  out.ledger = (
    await sql`SELECT coalesce(sum(actual_cost_usd),0)::float AS cost, count(*)::int AS n FROM crawler_ai_cost_ledger WHERE actual_cost_usd IS NOT NULL`
  )[0]
  out.approved_for_ai = (
    await sql`SELECT count(*)::int AS c FROM news_clusters WHERE editorial_decision = 'APPROVED_FOR_AI'`
  )[0]
  out.machine_eligible = (
    await sql`SELECT count(*)::int AS c FROM news_clusters WHERE machine_draft_eligibility = 'AUTO_DRAFT_ELIGIBLE'`
  )[0]
  out.machine_none_decision = (
    await sql`
    SELECT count(*)::int AS c FROM news_clusters
    WHERE machine_draft_eligibility = 'AUTO_DRAFT_ELIGIBLE'
      AND editorial_decision = 'NONE'`
  )[0]

  if (mode === 'baseline' || mode === 'observe') {
    out.fresh_multi = await sql`
      SELECT c.id, c.canonical_title, c.editorial_decision, c.ai_eligibility,
        c.machine_draft_eligibility, c.machine_draft_eligibility_reason,
        c.unique_source_count, c.importance_score, c.cluster_confidence, c.city,
        c.primary_source_name, c.created_at, c.published_news_id,
        coalesce(max(r.word_count),0)::int AS max_words,
        coalesce(avg(r.extraction_confidence),0)::float AS avg_conf,
        coalesce(avg(s.health_score),0)::float AS avg_health
      FROM news_clusters c
      LEFT JOIN raw_articles r ON r.cluster_id = c.id AND coalesce(r.is_exact_duplicate,0)=0
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE c.published_news_id IS NULL
        AND c.editorial_decision = 'NONE'
        AND c.unique_source_count >= 2
        AND c.created_at > now() - interval '12 hours'
      GROUP BY c.id
      HAVING coalesce(max(r.word_count),0) >= 120
      ORDER BY c.unique_source_count DESC, max(r.word_count) DESC
      LIMIT 8`
    out.fresh_single = await sql`
      SELECT c.id, c.canonical_title, c.editorial_decision, c.ai_eligibility,
        c.machine_draft_eligibility, c.machine_draft_eligibility_reason,
        c.unique_source_count, c.importance_score, c.cluster_confidence, c.city,
        c.primary_source_name, c.created_at,
        coalesce(max(r.word_count),0)::int AS max_words,
        coalesce(avg(r.extraction_confidence),0)::float AS avg_conf,
        coalesce(avg(s.health_score),0)::float AS avg_health
      FROM news_clusters c
      LEFT JOIN raw_articles r ON r.cluster_id = c.id AND coalesce(r.is_exact_duplicate,0)=0
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE c.published_news_id IS NULL
        AND c.editorial_decision = 'NONE'
        AND c.unique_source_count = 1
        AND c.created_at > now() - interval '12 hours'
        AND (c.city IS NOT NULL OR c.importance_score >= 40)
      GROUP BY c.id
      HAVING coalesce(max(r.word_count),0) >= 120
        AND coalesce(avg(r.extraction_confidence),0) >= 0.7
        AND coalesce(avg(s.health_score),0) >= 60
      ORDER BY max(r.word_count) DESC
      LIMIT 8`
    out.classified_none_ready = await sql`
      SELECT c.id, c.canonical_title, c.editorial_decision, c.machine_draft_eligibility,
        c.machine_draft_eligibility_reason, c.unique_source_count, c.created_at,
        c.machine_draft_eligibility_meta
      FROM news_clusters c
      WHERE c.editorial_decision = 'NONE'
        AND c.machine_draft_eligibility = 'AUTO_DRAFT_ELIGIBLE'
      ORDER BY c.machine_draft_eligibility_at DESC NULLS LAST
      LIMIT 10`
  }

  if (mode === 'classify') {
    // Classify up to 40 fresh NONE events — machine fields only.
    const rows = await sql`
      SELECT c.id, c.canonical_title, c.editorial_decision, c.ai_eligibility, c.ai_eligibility_reason,
        c.unique_source_count, c.importance_score, c.city, c.district, c.published_news_id,
        c.has_material_update, c.update_review_status, c.content_fingerprint,
        c.created_at, c.latest_article_at,
        coalesce(max(r.word_count),0)::int AS max_words,
        coalesce(max(r.extraction_confidence),0)::float AS best_conf,
        coalesce(avg(s.health_score),0)::float AS avg_health,
        count(DISTINCT CASE WHEN coalesce(r.is_exact_duplicate,0)=0 THEN r.source_id END)::int AS ind_sources
      FROM news_clusters c
      LEFT JOIN raw_articles r ON r.cluster_id = c.id
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE c.published_news_id IS NULL
        AND c.editorial_decision = 'NONE'
        AND c.created_at > now() - interval '18 hours'
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 40`

    const results: unknown[] = []
    for (const row of rows as any[]) {
      const editorialBefore = row.editorial_decision
      const staleHours = row.latest_article_at
        ? (now.getTime() - new Date(row.latest_article_at).getTime()) / 3_600_000
        : 999
      const gateInput = {
        clusterAiEligibility: row.ai_eligibility,
        clusterAiEligibilityReason: row.ai_eligibility_reason,
        editorialDecision: row.editorial_decision,
        publishedNewsId: row.published_news_id,
        hasActiveAiJob: false,
        hasCompletedDraft: false,
        hasMaterialUpdate: Boolean(row.has_material_update),
        updateReviewStatus: row.update_review_status,
        bestWordCount: row.max_words,
        independentSourceCount: row.ind_sources,
        uniqueSourceCount: row.unique_source_count,
        staleHours,
        exactDuplicateOnly: false,
        avgHealth: row.avg_health,
        bestConfidence: row.best_conf,
        hasLocalGeography: Boolean(row.city || row.district),
        importanceScore: row.importance_score,
      }
      const gate = evaluateAutoDraftGate(gateInput)
      const machine = toMachineDraftEligibility(gate)
      const meta = buildMachineEligibilityMeta({
        gate,
        gateInput,
        cutoffIso: process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER || null,
        contentFingerprint: row.content_fingerprint,
      })
      await sql`
        UPDATE news_clusters
        SET machine_draft_eligibility = ${machine},
            machine_draft_eligibility_reason = ${gate.reason},
            machine_draft_eligibility_at = ${now.toISOString()}::timestamptz,
            machine_draft_eligibility_meta = ${JSON.stringify(meta)}::jsonb,
            auto_draft_status = ${gate.readyForJob ? 'AUTO_DRAFT_ELIGIBLE' : gate.status},
            updated_at = ${now.toISOString()}::timestamptz
        WHERE id = ${row.id}
          AND editorial_decision = ${editorialBefore}`

      const check = (
        await sql`SELECT editorial_decision, machine_draft_eligibility FROM news_clusters WHERE id = ${row.id}`
      )[0] as any
      if (check.editorial_decision !== editorialBefore) {
        throw new Error(`HUMAN_DECISION_MUTATED ${row.id}`)
      }
      results.push({
        id: row.id,
        title: row.canonical_title,
        editorial_decision: check.editorial_decision,
        machine_draft_eligibility: check.machine_draft_eligibility,
        reason: gate.reason,
        ind: row.ind_sources,
        words: row.max_words,
        conf: row.best_conf,
        health: row.avg_health,
        importance: row.importance_score,
        city: row.city,
      })
    }
    out.classified = results
    out.jobs_after = (
      await sql`SELECT count(*)::int AS c FROM crawler_ai_jobs WHERE status IN ('PENDING','RESERVED','PROCESSING')`
    )[0]
    out.ledger_after = (
      await sql`SELECT coalesce(sum(actual_cost_usd),0)::float AS cost FROM crawler_ai_cost_ledger WHERE actual_cost_usd IS NOT NULL`
    )[0]
  }

  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2).slice(0, 4000))
  console.log('WROTE', outPath)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
