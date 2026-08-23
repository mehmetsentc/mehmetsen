/**
 * Phase 4F.3.1 — shadow unique economics + concurrency acceptance helpers.
 * Never enables provider/dispatch. Read-only by default; --recalc / --observe / --sources.
 *
 * Usage:
 *   npx tsx scripts/_phase4f31-accept.mts --recalc
 *   npx tsx scripts/_phase4f31-accept.mts --observe
 *   npx tsx scripts/_phase4f31-accept.mts --sources
 *   npx tsx scripts/_phase4f31-accept.mts --firewall
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  aggregateUniqueEconomicMetrics,
  compareRawVsUniqueEconomics,
} from '../src/services/crawler/autoDraft/shadowUniqueEconomics'
import { derivedSourcePauseReason } from '../src/services/crawler/autoDraft/sourcePauseAudit'

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

loadEnvLocal()

async function sqlClient() {
  const { neon } = await import('@neondatabase/serverless')
  return neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
}

async function recalc() {
  const sql = await sqlClient()
  const rows = await sql`
    SELECT cluster_id, content_fingerprint, prespend_gate_version, action, block_reason,
           economic_tier, estimated_cost_usd, cost_known, prespend_outcome
    FROM crawler_ai_shadow_decisions
    ORDER BY evaluated_at ASC`
  const mapped = rows.map((r: Record<string, unknown>) => ({
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
  const compare = compareRawVsUniqueEconomics(mapped)
  const clusters = await sql`SELECT count(DISTINCT cluster_id)::int AS c FROM crawler_ai_shadow_decisions`
  const econ = await sql`
    SELECT count(*)::int AS c FROM crawler_ai_shadow_economic_decisions`.catch(() => [{ c: 0 }])
  const out = {
    at: new Date().toISOString(),
    rawRows: mapped.length,
    distinctClusters: clusters[0]?.c ?? null,
    economicTableRows: econ[0]?.c ?? null,
    oldRepeatedEstimate: compare.oldRepeatedEstimate,
    newUniqueEstimate: compare.newUniqueEstimate,
    note:
      'OLD ~$2.16 is only "savings" if NEW unique estimatedSpendPreventedUsd supports a similar magnitude.',
  }
  writeFileSync('tmp-phase4f31-recalc.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

async function observe() {
  const sql = await sqlClient()
  const evals = await sql`
    SELECT count(*)::int AS c,
           count(*) FILTER (WHERE action = 'WOULD_DISPATCH')::int AS wd,
           count(*) FILTER (WHERE action = 'WOULD_BLOCK')::int AS wb,
           count(DISTINCT cluster_id)::int AS clusters,
           count(*) FILTER (WHERE content_fingerprint IS NOT NULL)::int AS with_fp
    FROM crawler_ai_shadow_decisions`
  const econRows = await sql`
    SELECT cluster_id, content_fingerprint, prespend_gate_version, action, block_reason,
           economic_tier, estimated_cost_usd, cost_known, prespend_outcome, revision_kind
    FROM crawler_ai_shadow_economic_decisions`.catch(() => [])
  const econ = await sql`
    SELECT count(*)::int AS c,
           count(*) FILTER (WHERE action = 'WOULD_DISPATCH')::int AS wd,
           count(*) FILTER (WHERE action = 'WOULD_BLOCK')::int AS wb,
           count(*) FILTER (WHERE revision_kind = 'NEW_EVENT')::int AS new_event,
           count(*) FILTER (WHERE revision_kind = 'MATERIAL_UPDATE')::int AS material,
           count(DISTINCT cluster_id)::int AS clusters
    FROM crawler_ai_shadow_economic_decisions`.catch(() => [
    { c: 0, wd: 0, wb: 0, new_event: 0, material: 0, clusters: 0 },
  ])
  const uniqueMetrics = aggregateUniqueEconomicMetrics(
    (econRows as Record<string, unknown>[]).map((r) => ({
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
  )
  const jobs = await sql`
    SELECT count(*)::int AS c FROM crawler_ai_jobs
    WHERE created_at > now() - interval '24 hours'`
  const jobsSince = await sql`
    SELECT count(*)::int AS c FROM crawler_ai_jobs
    WHERE created_at >= '2026-08-21T14:48:00.000Z'`
  const ledger = await sql`
    SELECT count(*)::int AS c,
           coalesce(sum(actual_cost_usd),0)::float AS spend
    FROM crawler_ai_cost_ledger
    WHERE timestamp > now() - interval '24 hours'`
  const ledgerSince = await sql`
    SELECT count(*)::int AS c,
           coalesce(sum(actual_cost_usd),0)::float AS spend
    FROM crawler_ai_cost_ledger
    WHERE timestamp >= '2026-08-21T14:48:00.000Z'`
  const out = {
    at: new Date().toISOString(),
    evaluations: evals[0],
    uniqueEconomic: econ[0],
    uniqueMetrics,
    jobs24h: jobs[0],
    jobsSinceDeploy: jobsSince[0],
    ledger24h: ledger[0],
    ledgerSinceDeploy: ledgerSince[0],
  }
  writeFileSync('tmp-phase4f31-observe.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

async function sources() {
  const sql = await sqlClient()
  const byStatus = await sql`
    SELECT status, count(*)::int AS c FROM news_sources GROUP BY 1 ORDER BY 1`
  const pause = await sql`
    SELECT coalesce(last_pause_reason, 'null') AS reason, count(*)::int AS c
    FROM news_sources WHERE status = 'PAUSED'
    GROUP BY 1 ORDER BY c DESC`
  const paused = await sql`
    SELECT id, name, status, last_pause_reason
    FROM news_sources WHERE status = 'PAUSED' LIMIT 80`
  const derived = pause.map((r: { reason: string; c: number }) => ({
    stored: r.reason,
    derived:
      r.reason === 'null'
        ? derivedSourcePauseReason({ status: 'PAUSED', lastPauseReason: null })
        : r.reason,
    count: r.c,
  }))
  const out = { at: new Date().toISOString(), byStatus, pauseReasons: derived, sample: paused.slice(0, 5) }
  writeFileSync('tmp-phase4f31-sources.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

async function firewall() {
  const out = {
    at: new Date().toISOString(),
    CRAWLER_AI_MODE: process.env.CRAWLER_AI_MODE || null,
    CRAWLER_AI_PROVIDER_ENABLED: process.env.CRAWLER_AI_PROVIDER_ENABLED || null,
    CRAWLER_AI_DISPATCH_ENABLED: process.env.CRAWLER_AI_DISPATCH_ENABLED || null,
    LEGACY_DIRECT_AI_ENABLED: process.env.LEGACY_DIRECT_AI_ENABLED || null,
    note: 'Local env readback only — verify Vercel production separately.',
  }
  writeFileSync('tmp-phase4f31-firewall.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

async function main() {
  if (process.argv.includes('--recalc')) return recalc()
  if (process.argv.includes('--observe')) return observe()
  if (process.argv.includes('--sources')) return sources()
  if (process.argv.includes('--firewall')) return firewall()
  console.log('Pass --recalc | --observe | --sources | --firewall')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
