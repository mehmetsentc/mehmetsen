/**
 * Phase 4D cost ledger aggregates — bounded SQL / in-memory rollups.
 * Avoids per-render full ledger scans in CMS.
 */

import type { CrawlerAiLedgerRow } from '../aiDispatch/types'

export type CostAggregateWindow = {
  label: 'today' | '7d' | '30d'
  since: Date
  requests: number
  successfulDrafts: number
  failedDrafts: number
  inputTokens: number
  outputTokens: number
  actualCostUsd: number
  estimatedCostUsd: number
  avgCostPerDraft: number | null
  avgCostPerSuccessfulDraft: number | null
  byProvider: Record<string, { requests: number; costUsd: number }>
  byModel: Record<string, { requests: number; costUsd: number }>
  byFailure: Record<string, number>
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function aggregateWindows(now = new Date()): { label: CostAggregateWindow['label']; since: Date }[] {
  const today = startOfUtcDay(now)
  return [
    { label: 'today', since: today },
    { label: '7d', since: new Date(today.getTime() - 6 * 86_400_000) },
    { label: '30d', since: new Date(today.getTime() - 29 * 86_400_000) },
  ]
}

export function aggregateLedgerRows(
  rows: CrawlerAiLedgerRow[],
  since: Date,
  label: CostAggregateWindow['label']
): CostAggregateWindow {
  const filtered = rows.filter((r) => r.timestamp.getTime() >= since.getTime())
  let successfulDrafts = 0
  let failedDrafts = 0
  let inputTokens = 0
  let outputTokens = 0
  let actualCostUsd = 0
  let estimatedCostUsd = 0
  const byProvider: CostAggregateWindow['byProvider'] = {}
  const byModel: CostAggregateWindow['byModel'] = {}
  const byFailure: Record<string, number> = {}

  for (const r of filtered) {
    inputTokens += r.inputTokens || 0
    outputTokens += r.outputTokens || 0
    actualCostUsd += r.actualCostUsd || 0
    estimatedCostUsd += r.estimatedCostUsd || 0
    const cost = r.actualCostUsd ?? r.estimatedCostUsd ?? 0
    const p = r.provider || 'unknown'
    byProvider[p] = byProvider[p] || { requests: 0, costUsd: 0 }
    byProvider[p].requests += 1
    byProvider[p].costUsd += cost
    const m = r.model || 'unknown'
    byModel[m] = byModel[m] || { requests: 0, costUsd: 0 }
    byModel[m].requests += 1
    byModel[m].costUsd += cost
    const ok = /success|completed|ok/i.test(r.status)
    const fail = /fail|error|blocked|cancel/i.test(r.status)
    if (ok) successfulDrafts += 1
    else if (fail) {
      failedDrafts += 1
      byFailure[r.status] = (byFailure[r.status] || 0) + 1
    }
  }

  const requests = filtered.length
  return {
    label,
    since,
    requests,
    successfulDrafts,
    failedDrafts,
    inputTokens,
    outputTokens,
    actualCostUsd,
    estimatedCostUsd,
    avgCostPerDraft: requests > 0 ? actualCostUsd / requests : null,
    avgCostPerSuccessfulDraft: successfulDrafts > 0 ? actualCostUsd / successfulDrafts : null,
    byProvider,
    byModel,
    byFailure,
  }
}

export function buildCostCmsPayload(rows: CrawlerAiLedgerRow[], now = new Date()) {
  const windows = aggregateWindows(now).map((w) => aggregateLedgerRows(rows, w.since, w.label))
  const byLane = (requestType: string | null, lane?: string) => {
    const filtered = rows.filter((r) => {
      if (requestType && r.requestType !== requestType) return false
      if (lane && r.lane !== lane) return false
      return true
    })
    const success = filtered.filter((r) => /success|completed|ok/i.test(r.status))
    const failure = filtered.filter((r) => /fail|error|blocked|cancel/i.test(r.status))
    const cost = filtered.reduce((s, r) => s + (r.actualCostUsd || 0), 0)
    const inTok = filtered.reduce((s, r) => s + (r.inputTokens || 0), 0)
    const outTok = filtered.reduce((s, r) => s + (r.outputTokens || 0), 0)
    return {
      requests: filtered.length,
      success: success.length,
      failure: failure.length,
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: cost,
      avgSuccessfulDraftCostUsd: success.length > 0 ? cost / success.length : null,
    }
  }
  return {
    windows,
    unavailable: false as const,
    lanes: {
      manualCanary: byLane('generation', 'manual_canary'),
      controlledAutoDraft: byLane('controlled_auto_draft'),
      manualRetry: byLane('manual_retry'),
    },
  }
}

export function costCmsUnavailablePayload(message = 'Veri alınamadı') {
  return {
    windows: null,
    unavailable: true as const,
    error: message,
    messageTr: 'Veri alınamadı' as const,
    lastSuccessAt: null as string | null,
  }
}
