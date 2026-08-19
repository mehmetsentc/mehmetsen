import { crawlerAiDispatchConfig } from './flags'
import type { AiCostLane, CrawlerAiBudgetWindow } from './types'
import { newCrawlerId } from '../store/types'

export type BudgetSnapshot = {
  hour: CrawlerAiBudgetWindow
  day: CrawlerAiBudgetWindow
}

export function periodKeys(now: Date): { hour: string; day: string } {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  const h = String(now.getUTCHours()).padStart(2, '0')
  return { day: `${y}-${m}-${d}`, hour: `${y}-${m}-${d}T${h}` }
}

export function emptyWindow(
  lane: AiCostLane,
  periodType: 'hour' | 'day',
  periodKey: string
): CrawlerAiBudgetWindow {
  return {
    id: newCrawlerId('bw'),
    lane,
    periodType,
    periodKey,
    reservedUsd: 0,
    spentUsd: 0,
    requestCount: 0,
  }
}

export type ReserveResult =
  | { ok: true; hour: CrawlerAiBudgetWindow; day: CrawlerAiBudgetWindow }
  | {
      ok: false
      reason:
        | 'HOURLY_BUDGET_EXCEEDED'
        | 'DAILY_BUDGET_EXCEEDED'
        | 'HOURLY_REQUEST_LIMIT'
        | 'DAILY_REQUEST_LIMIT'
        | 'CONCURRENCY_LIMIT'
    }

export function tryReserveBudget(input: {
  hour: CrawlerAiBudgetWindow
  day: CrawlerAiBudgetWindow
  costUsd: number
  concurrentJobs: number
}): ReserveResult {
  const cfg = crawlerAiDispatchConfig()
  if (input.concurrentJobs >= cfg.maxConcurrentJobs) {
    return { ok: false, reason: 'CONCURRENCY_LIMIT' }
  }
  if (input.hour.requestCount >= cfg.maxRequestsPerHour) {
    return { ok: false, reason: 'HOURLY_REQUEST_LIMIT' }
  }
  if (input.day.requestCount >= cfg.maxRequestsPerDay) {
    return { ok: false, reason: 'DAILY_REQUEST_LIMIT' }
  }
  const hourUsed = input.hour.reservedUsd + input.hour.spentUsd
  if (hourUsed + input.costUsd > cfg.hourlyBudgetUsd + 1e-12) {
    return { ok: false, reason: 'HOURLY_BUDGET_EXCEEDED' }
  }
  const dayUsed = input.day.reservedUsd + input.day.spentUsd
  if (dayUsed + input.costUsd > cfg.dailyBudgetUsd + 1e-12) {
    return { ok: false, reason: 'DAILY_BUDGET_EXCEEDED' }
  }
  return {
    ok: true,
    hour: {
      ...input.hour,
      reservedUsd: input.hour.reservedUsd + input.costUsd,
      requestCount: input.hour.requestCount + 1,
    },
    day: {
      ...input.day,
      reservedUsd: input.day.reservedUsd + input.costUsd,
      requestCount: input.day.requestCount + 1,
    },
  }
}

export function settleReservation(
  window: CrawlerAiBudgetWindow,
  reservedUsd: number,
  actualUsd: number
): CrawlerAiBudgetWindow {
  return {
    ...window,
    reservedUsd: Math.max(0, window.reservedUsd - reservedUsd),
    spentUsd: window.spentUsd + actualUsd,
  }
}

export function releaseReservation(window: CrawlerAiBudgetWindow, reservedUsd: number): CrawlerAiBudgetWindow {
  return {
    ...window,
    reservedUsd: Math.max(0, window.reservedUsd - reservedUsd),
  }
}
