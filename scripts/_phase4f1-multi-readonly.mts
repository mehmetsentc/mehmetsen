/**
 * Phase 4F.1 — read-only multi-source gate evaluation (no UPDATE, no jobs, $0).
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  evaluateAutoDraftGate,
  toMachineDraftEligibility,
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
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const now = new Date()
  const rows = await sql`
    SELECT c.id, c.canonical_title, c.editorial_decision, c.ai_eligibility, c.ai_eligibility_reason,
      c.unique_source_count, c.importance_score, c.city, c.district, c.published_news_id,
      c.has_material_update, c.update_review_status, c.content_fingerprint,
      c.created_at, c.latest_article_at, c.primary_source_name, c.machine_draft_eligibility,
      coalesce(max(r.word_count),0)::int AS max_words,
      coalesce(max(r.extraction_confidence),0)::float AS best_conf,
      coalesce(avg(s.health_score),0)::float AS avg_health,
      count(DISTINCT CASE WHEN coalesce(r.is_exact_duplicate,0)=0 THEN r.source_id END)::int AS ind_sources
    FROM news_clusters c
    LEFT JOIN raw_articles r ON r.cluster_id = c.id
    LEFT JOIN news_sources s ON s.id = r.source_id
    WHERE c.published_news_id IS NULL
      AND c.editorial_decision = 'NONE'
      AND c.unique_source_count >= 2
      AND c.created_at > now() - interval '24 hours'
    GROUP BY c.id
    HAVING coalesce(max(r.word_count),0) >= 120
    ORDER BY c.unique_source_count DESC, max(r.word_count) DESC
    LIMIT 5`

  const out = []
  for (const row of rows as any[]) {
    const staleHours = row.latest_article_at
      ? (now.getTime() - new Date(row.latest_article_at).getTime()) / 3_600_000
      : 999
    const gate = evaluateAutoDraftGate({
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
    })
    const members = await sql`
      SELECT m.membership_role, s.name AS source_name, r.word_count, r.extraction_confidence, s.health_score
      FROM cluster_memberships m
      JOIN raw_articles r ON r.id = m.article_id
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE m.cluster_id = ${row.id}
      ORDER BY (CASE WHEN m.membership_role = 'PRIMARY' THEN 0 ELSE 1 END), r.word_count DESC NULLS LAST`
    out.push({
      id: row.id,
      title: row.canonical_title,
      editorial_decision: row.editorial_decision,
      persisted_machine: row.machine_draft_eligibility,
      evaluated_machine: toMachineDraftEligibility(gate),
      reason: gate.reason,
      readyForJob: gate.readyForJob,
      ind: row.ind_sources,
      words: row.max_words,
      conf: row.best_conf,
      health: row.avg_health,
      importance: row.importance_score,
      city: row.city,
      created_at: row.created_at,
      primary: row.primary_source_name,
      members,
    })
  }

  const path = 'tmp-phase4f1-multi-readonly.json'
  writeFileSync(path, JSON.stringify({ at: now.toISOString(), out }, null, 2))
  console.log(JSON.stringify({ at: now.toISOString(), out }, null, 2))
  console.log('WROTE', path)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
