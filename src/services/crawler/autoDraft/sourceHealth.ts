/**
 * Phase 4E — source health summary (report only; no auto-reactivate).
 */

import type { NewsSourceRecord } from '../types'

export type SourceHealthStatus = 'ACTIVE' | 'PAUSED' | 'DEGRADED' | 'DISABLED'

export type SourceHealthSummary = {
  total: number
  ACTIVE: number
  PAUSED: number
  DEGRADED: number
  DISABLED: number
  topPauseReasons: Array<{ reason: string; count: number }>
}

export function summarizeSourceHealth(sources: NewsSourceRecord[]): SourceHealthSummary {
  const counts = { ACTIVE: 0, PAUSED: 0, DEGRADED: 0, DISABLED: 0 }
  const pauseReasons = new Map<string, number>()
  for (const s of sources) {
    const st = (s.status || 'ACTIVE') as SourceHealthStatus
    if (st in counts) counts[st as keyof typeof counts] += 1
    else counts.DISABLED += 1
    if (st === 'PAUSED' || st === 'DEGRADED') {
      const reason = (s.lastPauseReason || 'bilinmiyor').trim() || 'bilinmiyor'
      pauseReasons.set(reason, (pauseReasons.get(reason) || 0) + 1)
    }
  }
  const topPauseReasons = [...pauseReasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  return {
    total: sources.length,
    ...counts,
    topPauseReasons,
  }
}
