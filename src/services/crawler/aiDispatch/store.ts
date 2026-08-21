import { newCrawlerId } from '../store/types'
import type {
  AiCostLane,
  CrawlerAiBudgetWindow,
  CrawlerAiCircuitState,
  CrawlerAiJobRecord,
  CrawlerAiLedgerRow,
  CrawlerAiShadowDecisionRow,
  CrawlerAiShadowEconomicDecisionRow,
  CrawlerAiShadowRow,
} from './types'
import { EDITORIAL_OUTPUT_TARGET } from './types'
import { emptyCircuit } from './circuit'
import { emptyWindow, periodKeys } from './budget'

export interface AiDispatchStore {
  getInitialJob(clusterId: string): Promise<CrawlerAiJobRecord | null>
  insertJob(job: CrawlerAiJobRecord): Promise<'inserted' | 'duplicate'>
  /**
   * Phase 4F.3 — insert only if active jobs &lt; maxConcurrent (same lock / txn as insert).
   * Prevents overlapping ticks from exceeding maxConcurrentJobs=1.
   */
  insertJobWithConcurrencyCap?(
    job: CrawlerAiJobRecord,
    maxConcurrent: number
  ): Promise<'inserted' | 'duplicate' | 'concurrency_limit'>
  updateJob(id: string, patch: Partial<CrawlerAiJobRecord>): Promise<void>
  listJobs(opts?: { status?: string; limit?: number }): Promise<CrawlerAiJobRecord[]>
  countActiveJobs(): Promise<number>
  /** Phase 4D.3 — atomic claim of ONE job with lease. Optional for memory tests. */
  claimNextJob?(input: {
    workerId: string
    leaseExpiresAt: Date
    now: Date
  }): Promise<CrawlerAiJobRecord | null>
  /** Phase 4D.3 — PROCESSING jobs with expired leases (for recovery). */
  listClaimableJobs?(opts?: { limit?: number; now?: Date }): Promise<CrawlerAiJobRecord[]>
  upsertShadow(row: CrawlerAiShadowRow): Promise<void>
  listShadow(opts?: { limit?: number }): Promise<CrawlerAiShadowRow[]>
  /** Phase 4F.3 — append-only shadow evaluation telemetry (optional on older stores). */
  insertShadowDecision?(row: CrawlerAiShadowDecisionRow): Promise<void>
  listShadowDecisions?(opts?: { limit?: number; since?: Date }): Promise<CrawlerAiShadowDecisionRow[]>
  /**
   * Phase 4F.3.1 — try insert unique economic decision.
   * Returns { inserted:true, row } on first fingerprint/gate, or { inserted:false, row } on duplicate.
   */
  tryInsertShadowEconomicDecision?(
    row: CrawlerAiShadowEconomicDecisionRow
  ): Promise<{ inserted: boolean; row: CrawlerAiShadowEconomicDecisionRow }>
  listShadowEconomicDecisions?(opts?: {
    limit?: number
    since?: Date
  }): Promise<CrawlerAiShadowEconomicDecisionRow[]>
  /** True if cluster already has any economic decision (any fingerprint/gate). */
  hasShadowEconomicDecisionForCluster?(clusterId: string): Promise<boolean>
  getBudgetWindow(lane: AiCostLane, periodType: 'hour' | 'day' | 'month', periodKey: string): Promise<CrawlerAiBudgetWindow>
  saveBudgetWindow(row: CrawlerAiBudgetWindow): Promise<void>
  /**
   * Atomic compare-and-set. Returns false if the window changed under us.
   * Correctness must not require an in-process mutex when two stores share DB state.
   */
  compareAndReserve(input: {
    lane: AiCostLane
    hour: CrawlerAiBudgetWindow
    day: CrawlerAiBudgetWindow
    nextHour: CrawlerAiBudgetWindow
    nextDay: CrawlerAiBudgetWindow
  }): Promise<boolean>
  insertLedger(row: Omit<CrawlerAiLedgerRow, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }): Promise<void>
  listLedger(opts?: { lane?: AiCostLane; since?: Date }): Promise<CrawlerAiLedgerRow[]>
  getCircuit(provider: string): Promise<CrawlerAiCircuitState>
  saveCircuit(state: CrawlerAiCircuitState): Promise<void>
}

export type SharedAiDispatchState = {
  jobs: Map<string, CrawlerAiJobRecord>
  shadow: Map<string, CrawlerAiShadowRow>
  shadowDecisions: CrawlerAiShadowDecisionRow[]
  shadowEconomicDecisions: Map<string, CrawlerAiShadowEconomicDecisionRow>
  windows: Map<string, CrawlerAiBudgetWindow>
  ledger: CrawlerAiLedgerRow[]
  circuits: Map<string, CrawlerAiCircuitState>
}

export function createSharedAiDispatchState(): SharedAiDispatchState {
  return {
    jobs: new Map(),
    shadow: new Map(),
    shadowDecisions: [],
    shadowEconomicDecisions: new Map(),
    windows: new Map(),
    ledger: [],
    circuits: new Map(),
  }
}

/**
 * In-memory AI dispatch store.
 * Phase 4F.3.1: two instances may share SharedAiDispatchState (simulating Neon).
 * Budget CAS + concurrency insert use synchronous check-and-set on shared maps —
 * an in-process mutex is optional and NOT required for correctness across instances.
 */
export class MemoryAiDispatchStore implements AiDispatchStore {
  jobs: Map<string, CrawlerAiJobRecord>
  shadow: Map<string, CrawlerAiShadowRow>
  shadowDecisions: CrawlerAiShadowDecisionRow[]
  shadowEconomicDecisions: Map<string, CrawlerAiShadowEconomicDecisionRow>
  windows: Map<string, CrawlerAiBudgetWindow>
  ledger: CrawlerAiLedgerRow[]
  circuits: Map<string, CrawlerAiCircuitState>
  /** Optional optimization only — correctness does not depend on this across shared state. */
  private useMemoryLock: boolean
  private lock: Promise<void> = Promise.resolve()

  constructor(opts?: { shared?: SharedAiDispatchState; useMemoryLock?: boolean }) {
    const shared = opts?.shared ?? createSharedAiDispatchState()
    this.jobs = shared.jobs
    this.shadow = shared.shadow
    this.shadowDecisions = shared.shadowDecisions
    this.shadowEconomicDecisions = shared.shadowEconomicDecisions
    this.windows = shared.windows
    this.ledger = shared.ledger
    this.circuits = shared.circuits
    this.useMemoryLock = opts?.useMemoryLock ?? false
  }

  private async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    if (!this.useMemoryLock) return fn()
    const prev = this.lock
    let release: () => void = () => undefined
    this.lock = new Promise((resolve) => {
      release = resolve
    })
    await prev
    try {
      return await fn()
    } finally {
      release()
    }
  }

  private econKey(clusterId: string, fp: string, gate: string) {
    return `${clusterId}|${fp}|${gate}`
  }

  async getInitialJob(clusterId: string): Promise<CrawlerAiJobRecord | null> {
    return (
      [...this.jobs.values()].find((j) => j.clusterId === clusterId && j.dispatchType === 'INITIAL') ?? null
    )
  }

  /** Sync uniqueness check — DB unique index analogue; no shared mutex required. */
  private insertJobSync(job: CrawlerAiJobRecord): 'inserted' | 'duplicate' {
    const active = [...this.jobs.values()].some(
      (j) =>
        j.clusterId === job.clusterId &&
        ['PENDING', 'RESERVED', 'PROCESSING'].includes(j.status)
    )
    if (active) return 'duplicate'
    if (job.dispatchType === 'INITIAL') {
      const exists = [...this.jobs.values()].some(
        (j) => j.clusterId === job.clusterId && j.dispatchType === 'INITIAL'
      )
      if (exists) return 'duplicate'
    }
    this.jobs.set(job.id, { ...job, outputTarget: EDITORIAL_OUTPUT_TARGET })
    return 'inserted'
  }

  async insertJob(job: CrawlerAiJobRecord): Promise<'inserted' | 'duplicate'> {
    return this.withLock(() => this.insertJobSync(job))
  }

  /**
   * Sync concurrency gate on shared jobs map (Neon CTE insert analogue).
   * Two independent stores sharing state → exactly one winner at maxConcurrent.
   */
  private insertJobWithConcurrencyCapSync(
    job: CrawlerAiJobRecord,
    maxConcurrent: number
  ): 'inserted' | 'duplicate' | 'concurrency_limit' {
    const activeCount = [...this.jobs.values()].filter((j) =>
      ['PENDING', 'RESERVED', 'PROCESSING'].includes(j.status)
    ).length
    if (activeCount >= maxConcurrent) return 'concurrency_limit'
    return this.insertJobSync(job) === 'inserted' ? 'inserted' : 'duplicate'
  }

  async insertJobWithConcurrencyCap(
    job: CrawlerAiJobRecord,
    maxConcurrent: number
  ): Promise<'inserted' | 'duplicate' | 'concurrency_limit'> {
    return this.withLock(() => this.insertJobWithConcurrencyCapSync(job, maxConcurrent))
  }

  async updateJob(id: string, patch: Partial<CrawlerAiJobRecord>): Promise<void> {
    const row = this.jobs.get(id)
    if (!row) return
    Object.assign(row, patch, { updatedAt: new Date() })
  }

  async listJobs(opts?: { status?: string; limit?: number }): Promise<CrawlerAiJobRecord[]> {
    return [...this.jobs.values()]
      .filter((j) => (opts?.status ? j.status === opts.status : true))
      .slice(0, opts?.limit ?? 200)
  }

  async countActiveJobs(): Promise<number> {
    return [...this.jobs.values()].filter((j) =>
      ['PENDING', 'RESERVED', 'PROCESSING'].includes(j.status)
    ).length
  }

  async claimNextJob(input: {
    workerId: string
    leaseExpiresAt: Date
    now: Date
  }): Promise<CrawlerAiJobRecord | null> {
    return this.withLock(() => {
      const candidates = [...this.jobs.values()]
        .filter((j) => {
          if (j.status === 'PENDING' || j.status === 'RESERVED') return true
          if (
            j.status === 'PROCESSING' &&
            (!j.leaseExpiresAt || j.leaseExpiresAt.getTime() <= input.now.getTime()) &&
            !j.executionId
          ) {
            return true
          }
          return false
        })
        .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.createdAt.getTime() - b.createdAt.getTime())

      const job = candidates[0]
      if (!job) return null
      Object.assign(job, {
        status: 'PROCESSING' as const,
        leaseOwner: input.workerId,
        leaseExpiresAt: input.leaseExpiresAt,
        lastHeartbeatAt: input.now,
        startedAt: input.now,
        attemptCount: (job.attemptCount || 0) + 1,
        updatedAt: input.now,
      })
      return { ...job }
    })
  }

  async listClaimableJobs(opts?: { limit?: number; now?: Date }): Promise<CrawlerAiJobRecord[]> {
    const now = opts?.now ?? new Date()
    return [...this.jobs.values()]
      .filter(
        (j) =>
          j.status === 'PROCESSING' &&
          (!j.leaseExpiresAt || j.leaseExpiresAt.getTime() <= now.getTime())
      )
      .slice(0, opts?.limit ?? 20)
  }

  async upsertShadow(row: CrawlerAiShadowRow): Promise<void> {
    this.shadow.set(row.clusterId, row)
  }

  async listShadow(opts?: { limit?: number }): Promise<CrawlerAiShadowRow[]> {
    return [...this.shadow.values()]
      .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())
      .slice(0, opts?.limit ?? 200)
  }

  async insertShadowDecision(row: CrawlerAiShadowDecisionRow): Promise<void> {
    this.shadowDecisions.push({ ...row })
  }

  async listShadowDecisions(opts?: {
    limit?: number
    since?: Date
  }): Promise<CrawlerAiShadowDecisionRow[]> {
    return this.shadowDecisions
      .filter((r) => !opts?.since || r.evaluatedAt >= opts.since)
      .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())
      .slice(0, opts?.limit ?? 500)
  }

  async tryInsertShadowEconomicDecision(
    row: CrawlerAiShadowEconomicDecisionRow
  ): Promise<{ inserted: boolean; row: CrawlerAiShadowEconomicDecisionRow }> {
    const key = this.econKey(row.clusterId, row.contentFingerprint, row.prespendGateVersion)
    const existing = this.shadowEconomicDecisions.get(key)
    if (existing) {
      existing.lastEvaluatedAt = row.lastEvaluatedAt
      existing.evaluationCount += 1
      return { inserted: false, row: { ...existing } }
    }
    const stored = { ...row }
    this.shadowEconomicDecisions.set(key, stored)
    return { inserted: true, row: { ...stored } }
  }

  async listShadowEconomicDecisions(opts?: {
    limit?: number
    since?: Date
  }): Promise<CrawlerAiShadowEconomicDecisionRow[]> {
    return [...this.shadowEconomicDecisions.values()]
      .filter((r) => !opts?.since || r.firstEvaluatedAt >= opts.since)
      .sort((a, b) => b.firstEvaluatedAt.getTime() - a.firstEvaluatedAt.getTime())
      .slice(0, opts?.limit ?? 500)
  }

  async hasShadowEconomicDecisionForCluster(clusterId: string): Promise<boolean> {
    return [...this.shadowEconomicDecisions.values()].some((r) => r.clusterId === clusterId)
  }

  private windowKey(lane: AiCostLane, periodType: string, periodKey: string) {
    return `${lane}:${periodType}:${periodKey}`
  }

  async getBudgetWindow(
    lane: AiCostLane,
    periodType: 'hour' | 'day' | 'month',
    periodKey: string
  ): Promise<CrawlerAiBudgetWindow> {
    const key = this.windowKey(lane, periodType, periodKey)
    const existing = this.windows.get(key)
    if (existing) return { ...existing }
    const created = emptyWindow(lane, periodType, periodKey)
    this.windows.set(key, created)
    return { ...created }
  }

  async saveBudgetWindow(row: CrawlerAiBudgetWindow): Promise<void> {
    this.windows.set(this.windowKey(row.lane, row.periodType, row.periodKey), { ...row })
  }

  /**
   * Synchronous CAS on shared windows — mirrors Neon UPDATE ... WHERE reserved/count match.
   * Does not require in-process mutex when two instances share the same maps.
   */
  private compareAndReserveSync(input: {
    lane: AiCostLane
    hour: CrawlerAiBudgetWindow
    day: CrawlerAiBudgetWindow
    nextHour: CrawlerAiBudgetWindow
    nextDay: CrawlerAiBudgetWindow
  }): boolean {
    const hourKey = this.windowKey(input.lane, 'hour', input.hour.periodKey)
    const dayKey = this.windowKey(input.lane, 'day', input.day.periodKey)
    const hour = this.windows.get(hourKey) ?? input.hour
    const day = this.windows.get(dayKey) ?? input.day
    if (hour.reservedUsd !== input.hour.reservedUsd || hour.requestCount !== input.hour.requestCount) {
      return false
    }
    if (day.reservedUsd !== input.day.reservedUsd || day.requestCount !== input.day.requestCount) {
      return false
    }
    this.windows.set(hourKey, { ...input.nextHour })
    this.windows.set(dayKey, { ...input.nextDay })
    return true
  }

  async compareAndReserve(input: {
    lane: AiCostLane
    hour: CrawlerAiBudgetWindow
    day: CrawlerAiBudgetWindow
    nextHour: CrawlerAiBudgetWindow
    nextDay: CrawlerAiBudgetWindow
  }): Promise<boolean> {
    return this.withLock(() => this.compareAndReserveSync(input))
  }

  async insertLedger(
    row: Omit<CrawlerAiLedgerRow, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }
  ): Promise<void> {
    this.ledger.push({
      id: row.id ?? newCrawlerId('led'),
      timestamp: row.timestamp ?? new Date(),
      ...row,
    })
  }

  async listLedger(opts?: { lane?: AiCostLane; since?: Date }): Promise<CrawlerAiLedgerRow[]> {
    return this.ledger.filter((r) => {
      if (opts?.lane && r.lane !== opts.lane) return false
      if (opts?.since && r.timestamp < opts.since) return false
      return true
    })
  }

  async getCircuit(provider: string): Promise<CrawlerAiCircuitState> {
    return this.circuits.get(provider) ?? emptyCircuit(provider)
  }

  async saveCircuit(state: CrawlerAiCircuitState): Promise<void> {
    this.circuits.set(state.provider, { ...state })
  }
}

export function snapshotBudget(store: MemoryAiDispatchStore, now: Date) {
  const keys = periodKeys(now)
  const hour = store.windows.get(`crawler_automatic:hour:${keys.hour}`)
  const day = store.windows.get(`crawler_automatic:day:${keys.day}`)
  return { hour, day, keys }
}
