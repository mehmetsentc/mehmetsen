/**
 * Phase 4F.3 — DB-backed atomic budget reservation for auto-draft enqueue.
 * Fixes overlapping-tick races that over-reserved request/USD counters.
 * Job uniqueness remains on crawler_ai_jobs unique indexes.
 */

import type { AiDispatchStore } from '../aiDispatch/store'
import {
  emptyWindow,
  periodKeys,
  releaseReservation,
  tryReserveBudget,
  type ReserveResult,
} from '../aiDispatch/budget'
import type { CrawlerAiBudgetWindow } from '../aiDispatch/types'
import type { AutoDraftBudgetLimits } from './budgetLimits'

export type AtomicReserveOk = {
  ok: true
  hour: CrawlerAiBudgetWindow
  day: CrawlerAiBudgetWindow
  month: CrawlerAiBudgetWindow
  costUsd: number
  concurrentJobs: number
}

export type AtomicReserveFail = {
  ok: false
  reason: string
}

export type AtomicReserveResult = AtomicReserveOk | AtomicReserveFail

const CAS_RETRIES = 4

/**
 * Load windows → tryReserve with fresh concurrent count → compareAndReserve CAS.
 * On contention, reload and retry. Never last-write-wins overwrite.
 */
export async function atomicReserveAutoDraftBudget(opts: {
  aiStore: AiDispatchStore
  costUsd: number
  limits: AutoDraftBudgetLimits
  now?: Date
}): Promise<AtomicReserveResult> {
  const now = opts.now ?? new Date()
  const keys = periodKeys(now)

  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const concurrentJobs = await opts.aiStore.countActiveJobs()
    let hour = await opts.aiStore.getBudgetWindow('crawler_automatic', 'hour', keys.hour)
    let day = await opts.aiStore.getBudgetWindow('crawler_automatic', 'day', keys.day)
    let month = await opts.aiStore.getBudgetWindow('crawler_automatic', 'month', keys.month)
    if (!month?.periodKey) month = emptyWindow('crawler_automatic', 'month', keys.month)

    const reserve: ReserveResult = tryReserveBudget({
      hour,
      day,
      month,
      costUsd: opts.costUsd,
      concurrentJobs,
      maxRequestsPerHour: opts.limits.maxDraftsPerHour,
      maxRequestsPerDay: opts.limits.maxDraftsPerDay,
      hourlyBudgetUsd: opts.limits.maxHourlyCostUsd,
      dailyBudgetUsd: opts.limits.maxDailyCostUsd,
      monthlyBudgetUsd: opts.limits.maxMonthlyCostUsd,
    })

    if (!reserve.ok) {
      return { ok: false, reason: reserve.reason }
    }

    const cas = await opts.aiStore.compareAndReserve({
      lane: 'crawler_automatic',
      hour,
      day,
      nextHour: reserve.hour,
      nextDay: reserve.day,
    })
    if (!cas) {
      continue
    }

    // Month is best-effort after hour/day CAS (lower churn). Still persisted atomically via upsert.
    const nextMonth = reserve.month ?? month
    await opts.aiStore.saveBudgetWindow(nextMonth)

    return {
      ok: true,
      hour: reserve.hour,
      day: reserve.day,
      month: nextMonth,
      costUsd: opts.costUsd,
      concurrentJobs,
    }
  }

  return { ok: false, reason: 'BUDGET_CAS_CONTENTION' }
}

/** Roll back hour/day reservation after duplicate job insert. */
export async function releaseAutoDraftReservation(opts: {
  aiStore: AiDispatchStore
  hour: CrawlerAiBudgetWindow
  day: CrawlerAiBudgetWindow
  month?: CrawlerAiBudgetWindow
  costUsd: number
}): Promise<void> {
  await opts.aiStore.saveBudgetWindow({
    ...releaseReservation(opts.hour, opts.costUsd),
    requestCount: Math.max(0, opts.hour.requestCount - 1),
  })
  await opts.aiStore.saveBudgetWindow({
    ...releaseReservation(opts.day, opts.costUsd),
    requestCount: Math.max(0, opts.day.requestCount - 1),
  })
  if (opts.month) {
    await opts.aiStore.saveBudgetWindow({
      ...releaseReservation(opts.month, opts.costUsd),
      requestCount: Math.max(0, opts.month.requestCount - 1),
    })
  }
}
