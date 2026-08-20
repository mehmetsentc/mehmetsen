import { newCrawlerId } from '../store/types'
import type {
  AiCostLane,
  CrawlerAiBudgetWindow,
  CrawlerAiCircuitState,
  CrawlerAiJobRecord,
  CrawlerAiLedgerRow,
  CrawlerAiShadowRow,
} from './types'
import { EDITORIAL_OUTPUT_TARGET } from './types'
import { emptyCircuit } from './circuit'
import { emptyWindow, periodKeys } from './budget'

export interface AiDispatchStore {
  getInitialJob(clusterId: string): Promise<CrawlerAiJobRecord | null>
  insertJob(job: CrawlerAiJobRecord): Promise<'inserted' | 'duplicate'>
  updateJob(id: string, patch: Partial<CrawlerAiJobRecord>): Promise<void>
  listJobs(opts?: { status?: string; limit?: number }): Promise<CrawlerAiJobRecord[]>
  countActiveJobs(): Promise<number>
  upsertShadow(row: CrawlerAiShadowRow): Promise<void>
  listShadow(opts?: { limit?: number }): Promise<CrawlerAiShadowRow[]>
  getBudgetWindow(lane: AiCostLane, periodType: 'hour' | 'day' | 'month', periodKey: string): Promise<CrawlerAiBudgetWindow>
  saveBudgetWindow(row: CrawlerAiBudgetWindow): Promise<void>
  /**
   * Atomic compare-and-set. Returns false if the window changed under us.
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

export class MemoryAiDispatchStore implements AiDispatchStore {
  jobs = new Map<string, CrawlerAiJobRecord>()
  shadow = new Map<string, CrawlerAiShadowRow>()
  windows = new Map<string, CrawlerAiBudgetWindow>()
  ledger: CrawlerAiLedgerRow[] = []
  circuits = new Map<string, CrawlerAiCircuitState>()
  private lock: Promise<void> = Promise.resolve()

  private async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
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

  async getInitialJob(clusterId: string): Promise<CrawlerAiJobRecord | null> {
    return (
      [...this.jobs.values()].find((j) => j.clusterId === clusterId && j.dispatchType === 'INITIAL') ?? null
    )
  }

  async insertJob(job: CrawlerAiJobRecord): Promise<'inserted' | 'duplicate'> {
    return this.withLock(() => {
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
    })
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

  async upsertShadow(row: CrawlerAiShadowRow): Promise<void> {
    this.shadow.set(row.clusterId, row)
  }

  async listShadow(opts?: { limit?: number }): Promise<CrawlerAiShadowRow[]> {
    return [...this.shadow.values()]
      .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())
      .slice(0, opts?.limit ?? 200)
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

  async compareAndReserve(input: {
    lane: AiCostLane
    hour: CrawlerAiBudgetWindow
    day: CrawlerAiBudgetWindow
    nextHour: CrawlerAiBudgetWindow
    nextDay: CrawlerAiBudgetWindow
  }): Promise<boolean> {
    return this.withLock(() => {
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
    })
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
