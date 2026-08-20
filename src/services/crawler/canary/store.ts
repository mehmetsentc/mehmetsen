import type { CanaryJobRecord } from './types'
import { CANARY_COST_LANE } from './types'

export type CanaryLedgerRow = {
  id: string
  timestamp: Date
  provider: 'deepseek'
  model: string | null
  lane: typeof CANARY_COST_LANE
  jobId: string | null
  clusterId: string | null
  requestType: string | null
  inputTokens: number | null
  outputTokens: number | null
  estimatedCostUsd: number | null
  actualCostUsd: number | null
  status: string
}

export type CanaryStore = {
  getJobByCluster(clusterId: string): Promise<CanaryJobRecord | null>
  getJob(id: string): Promise<CanaryJobRecord | null>
  upsertJob(job: CanaryJobRecord): Promise<CanaryJobRecord>
  listRunning(): Promise<CanaryJobRecord[]>
  appendLedger(row: CanaryLedgerRow): Promise<void>
  listLedger(filter?: { lane?: string; clusterId?: string }): Promise<CanaryLedgerRow[]>
  getDraftId(clusterId: string): Promise<string | null>
  setDraftId(clusterId: string, draftId: string): Promise<void>
}

export class MemoryCanaryStore implements CanaryStore {
  private jobs = new Map<string, CanaryJobRecord>()
  private byCluster = new Map<string, string>()
  private ledger: CanaryLedgerRow[] = []
  private drafts = new Map<string, string>()

  async getJobByCluster(clusterId: string): Promise<CanaryJobRecord | null> {
    const id = this.byCluster.get(clusterId)
    return id ? this.jobs.get(id) ?? null : null
  }

  async getJob(id: string): Promise<CanaryJobRecord | null> {
    return this.jobs.get(id) ?? null
  }

  async upsertJob(job: CanaryJobRecord): Promise<CanaryJobRecord> {
    this.jobs.set(job.id, job)
    this.byCluster.set(job.clusterId, job.id)
    return job
  }

  async listRunning(): Promise<CanaryJobRecord[]> {
    return [...this.jobs.values()].filter((j) => j.state === 'RUNNING')
  }

  async appendLedger(row: CanaryLedgerRow): Promise<void> {
    this.ledger.push(row)
  }

  async listLedger(filter?: { lane?: string; clusterId?: string }): Promise<CanaryLedgerRow[]> {
    return this.ledger.filter((r) => {
      if (filter?.lane && r.lane !== filter.lane) return false
      if (filter?.clusterId && r.clusterId !== filter.clusterId) return false
      return true
    })
  }

  async getDraftId(clusterId: string): Promise<string | null> {
    return this.drafts.get(clusterId) ?? null
  }

  async setDraftId(clusterId: string, draftId: string): Promise<void> {
    this.drafts.set(clusterId, draftId)
  }
}

export function newCanaryId(prefix = 'cny'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
