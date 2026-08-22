/**
 * Phase 4F.4.2 — shadow quality optimization + source recovery audit helpers.
 * Modes: baseline | funnel | dispatch-pool | importance | tier-a | sources |
 *        recovery-test | observe | recalc | projection | report
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  aggregateUniqueEconomicMetrics,
  PRESPEND_GATE_VERSION_4F31,
  PRESPEND_GATE_VERSION_4F42,
} from '../src/services/crawler/autoDraft/shadowUniqueEconomics'
import {
  classifyEditorialContentClass,
  evaluateLowEditorialValue,
} from '../src/services/crawler/autoDraft/lowEditorialValue'
import { getDraftBodyWordCount } from '../src/services/crawler/autoDraft/draftBodyWords'
import { summarizeSourceHealth } from '../src/services/crawler/autoDraft/sourceHealth'

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

const mode = process.argv[2] || 'baseline'
const arg = process.argv[3] || ''
const outPath = process.argv[4] || `tmp-phase4f42-${mode}.json`

function t4f42(): string {
  return (
    (existsSync('tmp-phase4f42-T4F42.txt')
      ? readFileSync('tmp-phase4f42-T4F42.txt', 'utf8').trim()
      : '') || new Date().toISOString()
  )
}

function importanceBucket(score: number | null | undefined): string {
  const s = score ?? 0
  if (s <= 19) return '0-19'
  if (s <= 29) return '20-29'
  if (s <= 39) return '30-39'
  if (s <= 49) return '40-49'
  if (s <= 59) return '50-59'
  if (s <= 69) return '60-69'
  if (s <= 79) return '70-79'
  return '80-100'
}

function bucketImportance(rows: Array<{ importance_score?: number | null }>) {
  const buckets: Record<string, number> = {}
  for (const r of rows) {
    const b = importanceBucket(r.importance_score)
    buckets[b] = (buckets[b] || 0) + 1
  }
  return buckets
}

type SourceRecoveryClass =
  | 'SAFE_REACTIVATION_CANDIDATE'
  | 'NEEDS_PARSER_FIX'
  | 'ROBOTS_OR_ACCESS_BLOCK'
  | 'DEAD_OR_REDIRECTED'
  | 'DUPLICATE_SOURCE'
  | 'LOW_QUALITY_SOURCE'
  | 'UNKNOWN_LEGACY'
  | 'OTHER'

function classifyPausedSource(s: Record<string, unknown>, domains: Set<string>): SourceRecoveryClass {
  const reason = String(s.last_pause_reason || '').toLowerCase()
  const domain = String(s.domain || '').toLowerCase()
  const tier = String(s.quality_tier || '')
  const health = Number(s.health_score || 0)
  const failures = Number(s.consecutive_failures || 0)

  if (domains.has(domain)) return 'DUPLICATE_SOURCE'
  domains.add(domain)

  if (!reason || reason === 'null' || reason === 'bilinmiyor' || reason.includes('legacy')) {
    if (health >= 50 && tier !== 'TIER_D') return 'SAFE_REACTIVATION_CANDIDATE'
    return 'UNKNOWN_LEGACY'
  }
  if (/403|401|robots|access|blocked|forbidden/.test(reason)) return 'ROBOTS_OR_ACCESS_BLOCK'
  if (/404|410|redirect|dead|dns|enotfound|timeout|econnrefused/.test(reason)) return 'DEAD_OR_REDIRECTED'
  if (/parse|extract|html|empty|boilerplate|encoding/.test(reason)) return 'NEEDS_PARSER_FIX'
  if (/quality|spam|low|tier_d/.test(reason) || tier === 'TIER_D') return 'LOW_QUALITY_SOURCE'
  if (health >= 55 && failures <= 3 && !/403|404|parse/.test(reason)) return 'SAFE_REACTIVATION_CANDIDATE'
  return 'OTHER'
}

async function fetchProbe(url: string, timeoutMs = 12000): Promise<{ ok: boolean; status: number; reason: string }> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'NaHaber-Crawler/4F42-Recovery-Probe' },
    })
    clearTimeout(t)
    if (res.status >= 400) return { ok: false, status: res.status, reason: `http_${res.status}` }
    const text = await res.text()
    if (text.length < 200) return { ok: false, status: res.status, reason: 'body_too_short' }
    return { ok: true, status: res.status, reason: 'reachable' }
  } catch (e) {
    return { ok: false, status: 0, reason: e instanceof Error ? e.message.slice(0, 80) : 'fetch_error' }
  }
}

async function main() {
  loadEnvLocal()
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
  const T4F42 = t4f42()
  const out: Record<string, unknown> = { mode, at: new Date().toISOString(), T4F42 }

  if (mode === 'baseline' || mode === 'report') {
    out.health = { note: 'curl https://www.nahaber.com/api/health separately' }
    out.active_jobs = (
      await sql`
      SELECT count(*)::int AS c FROM crawler_ai_jobs
      WHERE status IN ('PENDING','RESERVED','PROCESSING')`
    )[0]
    out.jobs_by = await sql`
      SELECT status::text AS status, count(*)::int AS c
      FROM crawler_ai_jobs GROUP BY 1 ORDER BY 1`
    out.ledger_all = (
      await sql`
      SELECT coalesce(sum(actual_cost_usd),0)::float AS cost, count(*)::int AS n
      FROM crawler_ai_cost_ledger WHERE actual_cost_usd IS NOT NULL`
    )[0]
    out.ledger_after_T4F42 = (
      await sql`
      SELECT coalesce(sum(actual_cost_usd),0)::float AS cost, count(*)::int AS n
      FROM crawler_ai_cost_ledger WHERE timestamp > ${T4F42}::timestamptz`
    )[0]
    out.crawler_freshness = (
      await sql`
      SELECT
        (SELECT max(created_at) FROM raw_articles) AS latest_discovery,
        (SELECT max(updated_at) FROM raw_articles WHERE word_count > 0) AS latest_extract,
        (SELECT max(created_at) FROM news_clusters) AS latest_cluster,
        (SELECT max(updated_at) FROM news_clusters) AS latest_cluster_update`
    )[0]
    out.auto_pubs_after = (
      await sql`
      SELECT count(*)::int AS c FROM crawler_ai_jobs j
      JOIN news n ON n.id = j.editorial_news_id
      WHERE j.created_at > ${T4F42}::timestamptz
        AND n.published_at IS NOT NULL AND n.published_at > ${T4F42}::timestamptz`
    )[0]
  }

  const econRows = await sql`
    SELECT cluster_id, content_fingerprint, prespend_gate_version, action, block_reason,
      economic_tier, estimated_cost_usd::float AS estimated_cost_usd,
      cost_known, prespend_outcome, independent_source_count, usable_source_words,
      first_evaluated_at
    FROM crawler_ai_shadow_economic_decisions
    ORDER BY first_evaluated_at DESC`

  const uniqueRows = (econRows as Record<string, unknown>[]).map((r) => ({
    clusterId: String(r.cluster_id),
    contentFingerprint: r.content_fingerprint ? String(r.content_fingerprint) : null,
    prespendGateVersion: r.prespend_gate_version ? String(r.prespend_gate_version) : null,
    action: String(r.action),
    blockReason: r.block_reason ? String(r.block_reason) : null,
    economicTier: r.economic_tier ? String(r.economic_tier) : null,
    estimatedCostUsd: r.estimated_cost_usd != null ? Number(r.estimated_cost_usd) : null,
    costKnown: Number(r.cost_known) === 1,
    prespendOutcome: String(r.prespend_outcome),
  }))

  const allUnique = aggregateUniqueEconomicMetrics(uniqueRows)
  const legacyUnique = aggregateUniqueEconomicMetrics(
    uniqueRows.filter((r) => r.prespendGateVersion === PRESPEND_GATE_VERSION_4F31 || !r.prespendGateVersion?.startsWith('4F4')),
    { legacyClusterOnly: false }
  )
  const newGateUnique = aggregateUniqueEconomicMetrics(
    uniqueRows.filter((r) => r.prespendGateVersion === PRESPEND_GATE_VERSION_4F42)
  )

  if (mode === 'funnel' || mode === 'report' || mode === 'baseline') {
    out.funnel_all_unique = allUnique
    out.funnel_4f31_unique = legacyUnique
    out.funnel_4f42_unique = newGateUnique
  }

  if (mode === 'dispatch-pool' || mode === 'report') {
    const dispatchIds = (
      await sql`
      SELECT DISTINCT ON (e.cluster_id, e.content_fingerprint, e.prespend_gate_version)
        e.cluster_id, e.content_fingerprint, e.prespend_gate_version,
        e.estimated_cost_usd::float AS estimated_cost_usd,
        e.independent_source_count, e.usable_source_words,
        c.canonical_title, c.normalized_topic, c.city, c.importance_score,
        c.editorial_priority, c.cluster_confidence
      FROM crawler_ai_shadow_economic_decisions e
      JOIN news_clusters c ON c.id = e.cluster_id
      WHERE e.action = 'WOULD_DISPATCH'
      ORDER BY e.cluster_id, e.content_fingerprint, e.prespend_gate_version, e.first_evaluated_at DESC
      LIMIT 500`
    ) as Record<string, unknown>[]

    const sample = dispatchIds.slice(0, Math.max(100, Math.min(500, dispatchIds.length)))
    const byClass: Record<
      string,
      {
        count: number
        estimatedSpendUsd: number
        sourceCount: number
        usableWords: number
        importance: number
        confidence: number
      }
    > = {}

    for (const row of sample) {
      const title = String(row.canonical_title || '')
      const cls = classifyEditorialContentClass({
        title,
        normalizedTopic: String(row.normalized_topic || ''),
        city: row.city ? String(row.city) : null,
        importanceScore: row.importance_score != null ? Number(row.importance_score) : null,
        editorialPriority: row.editorial_priority ? String(row.editorial_priority) : null,
      })
      if (!byClass[cls]) {
        byClass[cls] = { count: 0, estimatedSpendUsd: 0, sourceCount: 0, usableWords: 0, importance: 0, confidence: 0 }
      }
      const b = byClass[cls]
      b.count += 1
      b.estimatedSpendUsd += Number(row.estimated_cost_usd || 0)
      b.sourceCount += Number(row.independent_source_count || 0)
      b.usableWords += Number(row.usable_source_words || 0)
      b.importance += Number(row.importance_score || 0)
      b.confidence += Number(row.cluster_confidence || 0)
    }

    const total = sample.length || 1
    out.dispatch_pool_sample_size = sample.length
    out.dispatch_pool_by_class = Object.fromEntries(
      Object.entries(byClass).map(([k, v]) => [
        k,
        {
          count: v.count,
          pct: Math.round((v.count / total) * 1000) / 10,
          estimatedSpendUsd: Math.round(v.estimatedSpendUsd * 1e6) / 1e6,
          avgSourceCount: Math.round((v.sourceCount / v.count) * 10) / 10,
          avgUsableWords: Math.round(v.usableWords / v.count),
          avgImportance: Math.round((v.importance / v.count) * 10) / 10,
          avgConfidence: Math.round((v.confidence / v.count) * 1000) / 1000,
        },
      ])
    )
  }

  if (mode === 'importance' || mode === 'report') {
    const joined = await sql`
      SELECT e.economic_tier, e.action, c.importance_score
      FROM crawler_ai_shadow_economic_decisions e
      JOIN news_clusters c ON c.id = e.cluster_id`
    const tierA = (joined as Record<string, unknown>[]).filter((r) => r.economic_tier === 'A')
    const tierB = (joined as Record<string, unknown>[]).filter((r) => r.economic_tier === 'B')
    const dispatch = (joined as Record<string, unknown>[]).filter((r) => r.action === 'WOULD_DISPATCH')
    const block = (joined as Record<string, unknown>[]).filter((r) => r.action === 'WOULD_BLOCK')
    out.importance_tier_a = bucketImportance(tierA)
    out.importance_tier_b = bucketImportance(tierB)
    out.importance_would_dispatch = bucketImportance(dispatch)
    out.importance_would_block = bucketImportance(block)
    out.tier_b_40_49_share =
      tierB.length > 0
        ? Math.round(
            ((tierB.filter((r) => (Number(r.importance_score) || 0) >= 40 && (Number(r.importance_score) || 0) <= 49).length /
              tierB.length) *
              1000) /
              10
          )
        : null
  }

  if (mode === 'tier-a' || mode === 'report') {
    const multi = await sql`
      SELECT c.id, c.canonical_title, c.unique_source_count, c.importance_score,
        c.cluster_confidence, c.machine_draft_eligibility, c.city,
        e.economic_tier, e.prespend_outcome, e.action, e.block_reason,
        coalesce(max(r.word_count),0)::int AS max_words,
        coalesce(avg(s.health_score),0)::float AS avg_health
      FROM news_clusters c
      LEFT JOIN crawler_ai_shadow_economic_decisions e ON e.cluster_id = c.id
      LEFT JOIN raw_articles r ON r.cluster_id = c.id AND coalesce(r.is_exact_duplicate,0)=0
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE c.unique_source_count >= 2
      GROUP BY c.id, e.economic_tier, e.prespend_outcome, e.action, e.block_reason
      ORDER BY c.updated_at DESC
      LIMIT 120`
    const rows = multi as Record<string, unknown>[]
    out.multi_source_clusters = rows.length
    out.multi_source_tier_a = rows.filter((r) => r.economic_tier === 'A').length
    out.multi_source_blocked_before_a = rows.filter(
      (r) => r.economic_tier !== 'A' && r.prespend_outcome !== 'PRESPEND_READY'
    ).length
    out.multi_source_block_reasons = rows.reduce(
      (acc: Record<string, number>, r) => {
        const k = String(r.prespend_outcome || r.block_reason || 'unknown')
        acc[k] = (acc[k] || 0) + 1
        return acc
      },
      {}
    )
    out.tier_a_root_causes = {
      A_traffic_few_multi: rows.length < 20,
      B_clustering_conservative: rows.filter((r) => r.machine_draft_eligibility === 'WAITING_FOR_MORE_SOURCES').length,
      C_source_overlap_low: rows.filter((r) => Number(r.unique_source_count) === 2).length,
      D_paused_sources_impact: 'see sources mode — 47 PAUSED reduces independent coverage',
      E_tier_a_strict: rows.filter((r) => Number(r.max_words) >= 400 && Number(r.avg_health) >= 60 && r.economic_tier !== 'A').length,
    }
  }

  if (mode === 'sources' || mode === 'recovery-test' || mode === 'report') {
    const sources = await sql`
      SELECT id, registry_key, name, domain, geographic_scope, source_category,
        quality_tier, health_score, status::text AS status, consecutive_failures,
        last_successful_discovery_at AS last_success_at,
        last_discovery_at AS last_crawl,
        last_pause_reason, base_url,
        rss_urls->>0 AS rss_url
      FROM news_sources ORDER BY status, health_score DESC NULLS LAST, name`
    const rows = sources as Record<string, unknown>[]
    out.source_health = summarizeSourceHealth(
      rows.map((s) => ({
        id: String(s.id),
        status: String(s.status) as 'ACTIVE' | 'PAUSED' | 'DEGRADED' | 'DISABLED',
        lastPauseReason: s.last_pause_reason ? String(s.last_pause_reason) : null,
        healthScore: s.health_score != null ? Number(s.health_score) : 50,
      })) as never
    )
    const domains = new Set<string>()
    const paused = rows.filter((s) => s.status === 'PAUSED')
    const classified = paused.map((s) => ({
      ...s,
      recovery_class: classifyPausedSource(s, domains),
    }))
    out.paused_by_class = classified.reduce(
      (acc: Record<string, number>, s) => {
        const k = String(s.recovery_class)
        acc[k] = (acc[k] || 0) + 1
        return acc
      },
      {}
    )
    out.paused_sources = classified

    if (mode === 'recovery-test' || mode === 'report') {
      const candidates = classified
        .filter((s) => s.recovery_class === 'SAFE_REACTIVATION_CANDIDATE')
        .sort((a, b) => Number(b.health_score || 0) - Number(a.health_score || 0))
        .slice(0, 8)
      const probes = []
      for (const c of candidates.slice(0, 5)) {
        const url = String(c.base_url || c.rss_url || '')
        if (!url.startsWith('http')) continue
        probes.push({
          id: c.id,
          registry_key: c.registry_key,
          name: c.name,
          domain: c.domain,
          url,
          ...(await fetchProbe(url)),
        })
      }
      out.recovery_probes = probes
      out.recovery_qualified = probes.filter((p) => p.ok).slice(0, 3)
    }
  }

  if (mode === 'simulate-recalc' || mode === 'report') {
    const dispatchSample = await sql`
      SELECT DISTINCT ON (e.cluster_id, e.content_fingerprint, e.prespend_gate_version)
        e.cluster_id, e.estimated_cost_usd::float AS estimated_cost_usd, e.action,
        e.prespend_outcome, e.economic_tier,
        c.canonical_title, c.normalized_topic, c.city, c.importance_score, c.editorial_priority
      FROM crawler_ai_shadow_economic_decisions e
      JOIN news_clusters c ON c.id = e.cluster_id
      WHERE e.prespend_gate_version = ${PRESPEND_GATE_VERSION_4F31}
      ORDER BY e.cluster_id, e.content_fingerprint, e.prespend_gate_version, e.first_evaluated_at DESC
      LIMIT 800`
    let wouldDispatchBefore = 0
    let wouldBlockBefore = 0
    let wouldDispatchAfter = 0
    let wouldBlockAfter = 0
    let lowEditorialBlocked = 0
    let spendBefore = 0
    let spendAfter = 0
    for (const row of dispatchSample as Record<string, unknown>[]) {
      const cost = Number(row.estimated_cost_usd || 0)
      const wasDispatch = row.action === 'WOULD_DISPATCH'
      if (wasDispatch) {
        wouldDispatchBefore += 1
        spendBefore += cost
      } else wouldBlockBefore += 1

      const editorial = evaluateLowEditorialValue({
        title: String(row.canonical_title || ''),
        normalizedTopic: String(row.normalized_topic || ''),
        city: row.city ? String(row.city) : null,
        importanceScore: row.importance_score != null ? Number(row.importance_score) : null,
        editorialPriority: row.editorial_priority ? String(row.editorial_priority) : null,
      })
      const wouldStillDispatch = wasDispatch && !editorial.lowEditorialValue
      if (wouldStillDispatch) {
        wouldDispatchAfter += 1
        spendAfter += cost
      } else {
        wouldBlockAfter += 1
        if (wasDispatch && editorial.lowEditorialValue) lowEditorialBlocked += 1
      }
    }
    out.simulated_recalc = {
      sampleSize: (dispatchSample as unknown[]).length,
      wouldDispatchBefore,
      wouldBlockBefore,
      wouldDispatchAfter,
      wouldBlockAfter,
      lowEditorialBlocked,
      requestsPrevented: wouldDispatchBefore - wouldDispatchAfter,
      spendBeforeUsd: Math.round(spendBefore * 1e6) / 1e6,
      spendAfterUsd: Math.round(spendAfter * 1e6) / 1e6,
      spendPreventedUsd: Math.round((spendBefore - spendAfter) * 1e6) / 1e6,
      note: 'Local simulation on 4F3.1 unique rows — production 4F4.2 gate requires deploy.',
    }
  }

  if (mode === 'report') {
    out.before_4f31 = legacyUnique
    out.after_4f42 = newGateUnique
    out.delta = {
      uniqueRevisions: newGateUnique.uniqueEventRevisions - 0,
      wouldDispatchDelta: newGateUnique.uniqueWouldDispatch - legacyUnique.uniqueWouldDispatch,
      wouldBlockDelta: newGateUnique.uniqueWouldBlock - legacyUnique.uniqueWouldBlock,
      lowEditorialValue: newGateUnique.byPrespend.LOW_EDITORIAL_VALUE || 0,
      requestsPrevented: newGateUnique.estimatedRequestsPrevented,
      spendPreventedUsd: newGateUnique.estimatedSpendPreventedUsd,
    }
  }

  if (mode === 'projection' || mode === 'report') {
    const paidAvg = (
      await sql`
      SELECT avg(actual_cost_usd)::float AS avg_cost,
        avg(input_tokens)::float AS avg_in,
        avg(output_tokens)::float AS avg_out,
        count(*)::int AS n
      FROM crawler_ai_cost_ledger
      WHERE status = 'SUCCESS' AND actual_cost_usd IS NOT NULL`
    )[0] as Record<string, unknown>
    const avgCost = Number(paidAvg.avg_cost || 0.004445)
    const currentDispatchRate =
      legacyUnique.uniqueEventRevisions > 0
        ? legacyUnique.uniqueWouldDispatch / legacyUnique.uniqueEventRevisions
        : 0.65
    const optimizedDispatchRate =
      newGateUnique.uniqueEventRevisions > 0
        ? newGateUnique.uniqueWouldDispatch / Math.max(1, newGateUnique.uniqueEventRevisions)
        : currentDispatchRate * 0.85
    const dailyRates = [10, 25, 50, 100]
    const project = (draftsPerDay: number, rate: number) => ({
      draftsPerDay,
      dispatchPerDay: Math.round(draftsPerDay * rate * 10) / 10,
      dailyCostUsd: Math.round(draftsPerDay * rate * avgCost * 1e6) / 1e6,
      monthlyCostUsd: Math.round(draftsPerDay * rate * avgCost * 30 * 1e4) / 1e4,
    })
    out.pricing = { inputPerM: 0.44, outputPerM: 1.32, avgPaidDraftUsd: avgCost, paidSamples: paidAvg.n }
    out.projection_current_gate = dailyRates.map((d) => project(d, currentDispatchRate))
    out.projection_optimized_gate = dailyRates.map((d) => project(d, optimizedDispatchRate))
    out.cost_per_100_drafts = Math.round(avgCost * 100 * 1e6) / 1e6
    out.cost_per_1000_drafts = Math.round(avgCost * 1000 * 1e4) / 1e4
  }

  if (mode === 'body-words') {
    const jobs = await sql`
      SELECT id, cluster_id, draft_snapshot
      FROM crawler_ai_jobs
      WHERE draft_snapshot IS NOT NULL AND status = 'COMPLETED'
      ORDER BY completed_at DESC NULLS LAST
      LIMIT 10`
    out.samples = (jobs as Record<string, unknown>[]).map((j) => ({
      job_id: j.id,
      cluster_id: j.cluster_id,
      canonical_body_words: getDraftBodyWordCount(j.draft_snapshot as Record<string, unknown>),
      legacy_top_level: (j.draft_snapshot as Record<string, unknown>)?.bodyWordCount ?? null,
    }))
  }

  if (mode === 'recovery-apply') {
    const qualified = existsSync('tmp-phase4f42-recovery-test.json')
      ? (JSON.parse(readFileSync('tmp-phase4f42-recovery-test.json', 'utf8')) as {
          recovery_qualified?: Array<{ id: string; registry_key?: string; name?: string }>
        }).recovery_qualified || []
      : []
    const toApply = qualified.slice(0, 3)
    if (toApply.length === 0) {
      out.applied = []
      out.note = 'No qualified sources — reactivated ZERO'
    } else {
      out.applied = []
      for (const s of toApply) {
        await sql`
          UPDATE news_sources
          SET status = 'ACTIVE',
              last_pause_reason = NULL,
              consecutive_failures = 0,
              updated_at = now()
          WHERE id = ${s.id} AND status = 'PAUSED'`
        out.applied.push({ id: s.id, registry_key: s.registry_key, name: s.name, reason: 'phase4f42_safe_recovery' })
      }
    }
  }

  if (mode === 'observe') {
    out.crawler_freshness = (
      await sql`
      SELECT
        (SELECT max(created_at) FROM raw_articles) AS latest_discovery,
        (SELECT max(updated_at) FROM raw_articles WHERE word_count > 0) AS latest_extract,
        (SELECT count(*)::int FROM raw_articles WHERE created_at > ${T4F42}::timestamptz) AS articles_discovered_after,
        (SELECT count(*)::int FROM news_clusters WHERE created_at > ${T4F42}::timestamptz) AS clusters_created_after,
        (SELECT count(*)::int FROM news_clusters WHERE unique_source_count >= 2 AND created_at > ${T4F42}::timestamptz) AS multi_source_after`
    )[0]
    out.shadow_after = newGateUnique
    out.sources_active = (
      await sql`SELECT count(*)::int AS c FROM news_sources WHERE status = 'ACTIVE'`
    )[0]
  }

  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
