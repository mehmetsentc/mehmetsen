/**
 * Persist machine eligibility for one cluster id (Design A). Human decision untouched.
 * Usage: npx tsx scripts/_phase4f1-persist-one.mts <clusterId>
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

async function main() {
  loadEnvLocal()
  const id = process.argv[2]
  if (!id) throw new Error('cluster id required')
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const now = new Date()
  const rows = await sql`
    SELECT c.id, c.canonical_title, c.editorial_decision, c.ai_eligibility, c.ai_eligibility_reason,
      c.unique_source_count, c.importance_score, c.city, c.district, c.published_news_id,
      c.has_material_update, c.update_review_status, c.content_fingerprint,
      c.created_at, c.latest_article_at, c.primary_source_name,
      coalesce(max(r.word_count),0)::int AS max_words,
      coalesce(max(r.extraction_confidence),0)::float AS best_conf,
      coalesce(avg(s.health_score),0)::float AS avg_health,
      count(DISTINCT CASE WHEN coalesce(r.is_exact_duplicate,0)=0 THEN r.source_id END)::int AS ind_sources
    FROM news_clusters c
    LEFT JOIN raw_articles r ON r.cluster_id = c.id
    LEFT JOIN news_sources s ON s.id = r.source_id
    WHERE c.id = ${id}
    GROUP BY c.id`
  const row = (rows as any[])[0]
  if (!row) throw new Error('not found')
  const before = row.editorial_decision
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
    cutoffIso: null,
    contentFingerprint: row.content_fingerprint,
  })
  await sql`
    UPDATE news_clusters SET
      machine_draft_eligibility = ${machine},
      machine_draft_eligibility_reason = ${gate.reason},
      machine_draft_eligibility_at = ${now.toISOString()}::timestamptz,
      machine_draft_eligibility_meta = ${JSON.stringify(meta)}::jsonb,
      auto_draft_status = ${gate.readyForJob ? 'AUTO_DRAFT_ELIGIBLE' : gate.status},
      updated_at = ${now.toISOString()}::timestamptz
    WHERE id = ${id} AND editorial_decision = ${before}`
  const after = (
    await sql`
    SELECT id, editorial_decision, machine_draft_eligibility, machine_draft_eligibility_reason,
      unique_source_count, auto_draft_status
    FROM news_clusters WHERE id = ${id}`
  )[0]
  if ((after as any).editorial_decision !== before) throw new Error('HUMAN_MUTATED')
  const members = await sql`
    SELECT m.membership_role, s.name AS source_name, r.word_count
    FROM cluster_memberships m
    JOIN raw_articles r ON r.id = m.article_id
    LEFT JOIN news_sources s ON s.id = r.source_id
    WHERE m.cluster_id = ${id}
    ORDER BY (CASE WHEN m.membership_role = 'PRIMARY' THEN 0 ELSE 1 END), r.word_count DESC NULLS LAST`
  const jobs = (
    await sql`SELECT count(*)::int AS c FROM crawler_ai_jobs WHERE status IN ('PENDING','RESERVED','PROCESSING')`
  )[0]
  const ledger = (
    await sql`SELECT coalesce(sum(actual_cost_usd),0)::float AS cost FROM crawler_ai_cost_ledger WHERE actual_cost_usd IS NOT NULL`
  )[0]
  const out = {
    at: now.toISOString(),
    before,
    after,
    gate,
    members,
    jobs,
    ledger,
    words: row.max_words,
    conf: row.best_conf,
    health: row.avg_health,
    importance: row.importance_score,
    title: row.canonical_title,
    primary: row.primary_source_name,
    ind: row.ind_sources,
  }
  writeFileSync('tmp-phase4f1-multi-persisted.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
