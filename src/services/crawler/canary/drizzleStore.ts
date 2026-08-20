/**
 * Neon-backed canary job + cost ledger store.
 */

import { and, eq, desc } from 'drizzle-orm'
import { getDb } from '@/db'
import { crawlerAiCanaryRuns, crawlerAiCostLedger } from '@/db/schema'
import type { CanaryDraftFields, CanaryEvidencePack, CanaryFactFlag, CanaryJobRecord, CanaryValidationResult } from './types'
import { CANARY_COST_LANE, CANARY_DRAFT_STATUS, CANARY_OUTPUT_TARGET } from './types'
import type { CanaryLedgerRow, CanaryStore } from './store'
import { newCanaryId } from './store'

function rowToJob(row: typeof crawlerAiCanaryRuns.$inferSelect): CanaryJobRecord {
  return {
    id: row.id,
    clusterId: row.clusterId,
    eventKey: row.eventKey,
    state: row.state as CanaryJobRecord['state'],
    provider: 'deepseek',
    model: row.model || 'deepseek-v4-flash',
    requestCount: row.requestCount,
    maxRequests: row.maxRequests as CanaryJobRecord['maxRequests'],
    estimatedInputTokens: row.estimatedInputTokens,
    estimatedOutputTokens: row.estimatedOutputTokens,
    estimatedCostUsd: row.estimatedCostUsd,
    actualInputTokens: row.actualInputTokens,
    actualOutputTokens: row.actualOutputTokens,
    actualCostUsd: row.actualCostUsd,
    blockedReason: row.blockedReason,
    failureReason: row.failureReason,
    editorialDraftId: row.editorialDraftId,
    outputTarget: CANARY_OUTPUT_TARGET,
    draftStatus: CANARY_DRAFT_STATUS,
    autoPublish: false,
    lane: CANARY_COST_LANE,
    packSnapshot: (row.packSnapshot as CanaryEvidencePack | null) ?? null,
    draft: (row.draftSnapshot as CanaryDraftFields | null) ?? null,
    validation: (row.validationSnapshot as CanaryValidationResult | null) ?? null,
    factFlags: (row.factFlags as CanaryFactFlag[]) || [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  }
}

export class DrizzleCanaryStore implements CanaryStore {
  async getJobByCluster(clusterId: string): Promise<CanaryJobRecord | null> {
    const db = getDb()
    const rows = await db
      .select()
      .from(crawlerAiCanaryRuns)
      .where(eq(crawlerAiCanaryRuns.clusterId, clusterId))
      .limit(1)
    return rows[0] ? rowToJob(rows[0]) : null
  }

  async getJob(id: string): Promise<CanaryJobRecord | null> {
    const db = getDb()
    const rows = await db.select().from(crawlerAiCanaryRuns).where(eq(crawlerAiCanaryRuns.id, id)).limit(1)
    return rows[0] ? rowToJob(rows[0]) : null
  }

  async upsertJob(job: CanaryJobRecord): Promise<CanaryJobRecord> {
    const db = getDb()
    const values = {
      id: job.id,
      clusterId: job.clusterId,
      eventKey: job.eventKey,
      state: job.state,
      provider: 'deepseek' as const,
      model: job.model,
      requestCount: job.requestCount,
      maxRequests: job.maxRequests,
      estimatedInputTokens: job.estimatedInputTokens,
      estimatedOutputTokens: job.estimatedOutputTokens,
      estimatedCostUsd: job.estimatedCostUsd,
      actualInputTokens: job.actualInputTokens,
      actualOutputTokens: job.actualOutputTokens,
      actualCostUsd: job.actualCostUsd,
      blockedReason: job.blockedReason,
      failureReason: job.failureReason,
      editorialDraftId: job.editorialDraftId,
      outputTarget: job.outputTarget,
      draftStatus: job.draftStatus,
      autoPublish: 0 as const,
      lane: CANARY_COST_LANE,
      packSnapshot: (job.packSnapshot as Record<string, unknown> | null) ?? null,
      draftSnapshot: (job.draft as Record<string, unknown> | null) ?? null,
      validationSnapshot: (job.validation as Record<string, unknown> | null) ?? null,
      factFlags: job.factFlags as unknown[],
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      updatedAt: new Date(),
    }

    const existing = await this.getJobByCluster(job.clusterId)
    if (existing) {
      await db
        .update(crawlerAiCanaryRuns)
        .set({ ...values, id: existing.id, createdAt: existing.createdAt })
        .where(eq(crawlerAiCanaryRuns.id, existing.id))
      return { ...job, id: existing.id, createdAt: existing.createdAt }
    }

    await db.insert(crawlerAiCanaryRuns).values({
      ...values,
      createdAt: job.createdAt ?? new Date(),
    })
    return job
  }

  async listRunning(): Promise<CanaryJobRecord[]> {
    const db = getDb()
    const rows = await db.select().from(crawlerAiCanaryRuns).where(eq(crawlerAiCanaryRuns.state, 'RUNNING'))
    return rows.map(rowToJob)
  }

  async appendLedger(row: CanaryLedgerRow): Promise<void> {
    const db = getDb()
    await db.insert(crawlerAiCostLedger).values({
      id: row.id || newCanaryId('ldg'),
      timestamp: row.timestamp,
      provider: row.provider,
      model: row.model,
      lane: row.lane,
      jobId: row.jobId,
      clusterId: row.clusterId,
      requestType: row.requestType,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      estimatedCostUsd: row.estimatedCostUsd,
      actualCostUsd: row.actualCostUsd,
      status: row.status,
    })
  }

  async listLedger(filter?: { lane?: string; clusterId?: string }): Promise<CanaryLedgerRow[]> {
    const db = getDb()
    const conds = []
    if (filter?.lane) conds.push(eq(crawlerAiCostLedger.lane, filter.lane))
    if (filter?.clusterId) conds.push(eq(crawlerAiCostLedger.clusterId, filter.clusterId))
    const rows = await db
      .select()
      .from(crawlerAiCostLedger)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(crawlerAiCostLedger.timestamp))
      .limit(200)
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      provider: 'deepseek' as const,
      model: r.model,
      lane: CANARY_COST_LANE,
      jobId: r.jobId,
      clusterId: r.clusterId,
      requestType: r.requestType,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      estimatedCostUsd: r.estimatedCostUsd,
      actualCostUsd: r.actualCostUsd,
      status: r.status,
    }))
  }

  async getDraftId(clusterId: string): Promise<string | null> {
    const job = await this.getJobByCluster(clusterId)
    return job?.editorialDraftId ?? null
  }

  async setDraftId(clusterId: string, draftId: string): Promise<void> {
    const job = await this.getJobByCluster(clusterId)
    if (!job) return
    job.editorialDraftId = draftId
    await this.upsertJob(job)
  }
}
