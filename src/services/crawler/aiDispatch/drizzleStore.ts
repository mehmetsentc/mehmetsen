import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import {
  crawlerAiBudgetWindows,
  crawlerAiCircuit,
  crawlerAiCostLedger,
  crawlerAiDispatchShadow,
  crawlerAiJobs,
} from '@/db/schema/crawler'
import { newCrawlerId } from '../store/types'
import { emptyCircuit } from './circuit'
import { emptyWindow } from './budget'
import { EDITORIAL_OUTPUT_TARGET, type AiCostLane, type CrawlerAiBudgetWindow, type CrawlerAiCircuitState, type CrawlerAiJobRecord, type CrawlerAiLedgerRow, type CrawlerAiShadowRow } from './types'
import type { AiDispatchStore } from './store'

function mapJob(row: typeof crawlerAiJobs.$inferSelect): CrawlerAiJobRecord {
  return {
    id: row.id,
    clusterId: row.clusterId,
    eventKey: row.eventKey,
    status: row.status as CrawlerAiJobRecord['status'],
    dispatchType: row.dispatchType as CrawlerAiJobRecord['dispatchType'],
    priority: row.priority,
    eligibilityStatus: row.eligibilityStatus,
    estimatedInputTokens: row.estimatedInputTokens,
    estimatedOutputTokens: row.estimatedOutputTokens,
    estimatedTotalTokens: row.estimatedTotalTokens,
    estimatedCostUsd: row.estimatedCostUsd,
    actualInputTokens: row.actualInputTokens,
    actualOutputTokens: row.actualOutputTokens,
    actualCostUsd: row.actualCostUsd,
    model: row.model,
    provider: row.provider,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    reservedAt: row.reservedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    blockedReason: row.blockedReason,
    failureReason: row.failureReason,
    editorialNewsId: row.editorialNewsId,
    outputTarget: EDITORIAL_OUTPUT_TARGET,
    selectedSourceCount: row.selectedSourceCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function canUseDrizzleAiDispatchStore(): boolean {
  return hasDatabaseUrl()
}

export class DrizzleAiDispatchStore implements AiDispatchStore {
  private db() {
    return getDb()
  }

  async getInitialJob(clusterId: string): Promise<CrawlerAiJobRecord | null> {
    const rows = await this.db()
      .select()
      .from(crawlerAiJobs)
      .where(and(eq(crawlerAiJobs.clusterId, clusterId), eq(crawlerAiJobs.dispatchType, 'INITIAL')))
      .limit(1)
    return rows[0] ? mapJob(rows[0]) : null
  }

  async insertJob(job: CrawlerAiJobRecord): Promise<'inserted' | 'duplicate'> {
    try {
      await this.db().insert(crawlerAiJobs).values({
        id: job.id,
        clusterId: job.clusterId,
        eventKey: job.eventKey,
        status: job.status,
        dispatchType: job.dispatchType,
        priority: job.priority,
        eligibilityStatus: job.eligibilityStatus,
        estimatedInputTokens: job.estimatedInputTokens,
        estimatedOutputTokens: job.estimatedOutputTokens,
        estimatedTotalTokens: job.estimatedTotalTokens,
        estimatedCostUsd: job.estimatedCostUsd,
        actualInputTokens: job.actualInputTokens,
        actualOutputTokens: job.actualOutputTokens,
        actualCostUsd: job.actualCostUsd,
        model: job.model,
        provider: job.provider,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        reservedAt: job.reservedAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        blockedReason: job.blockedReason,
        failureReason: job.failureReason,
        editorialNewsId: job.editorialNewsId,
        outputTarget: job.outputTarget,
        selectedSourceCount: job.selectedSourceCount,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })
      return 'inserted'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/unique|duplicate/i.test(msg)) return 'duplicate'
      throw err
    }
  }

  async updateJob(id: string, patch: Partial<CrawlerAiJobRecord>): Promise<void> {
    await this.db()
      .update(crawlerAiJobs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(crawlerAiJobs.id, id))
  }

  async listJobs(opts?: { status?: string; limit?: number }): Promise<CrawlerAiJobRecord[]> {
    const rows = opts?.status
      ? await this.db()
          .select()
          .from(crawlerAiJobs)
          .where(eq(crawlerAiJobs.status, opts.status))
          .orderBy(desc(crawlerAiJobs.createdAt))
          .limit(opts.limit ?? 200)
      : await this.db()
          .select()
          .from(crawlerAiJobs)
          .orderBy(desc(crawlerAiJobs.createdAt))
          .limit(opts?.limit ?? 200)
    return rows.map(mapJob)
  }

  async countActiveJobs(): Promise<number> {
    const rows = await this.db()
      .select({ n: sql<number>`count(*)` })
      .from(crawlerAiJobs)
      .where(sql`${crawlerAiJobs.status} in ('PENDING','RESERVED','PROCESSING')`)
    return Number(rows[0]?.n || 0)
  }

  async upsertShadow(row: CrawlerAiShadowRow): Promise<void> {
    await this.db()
      .insert(crawlerAiDispatchShadow)
      .values({
        clusterId: row.clusterId,
        eventKey: row.eventKey,
        canonicalTitle: row.canonicalTitle,
        eligibility: row.eligibility,
        wouldDispatch: row.wouldDispatch ? 1 : 0,
        blockedReason: row.blockedReason,
        dispatchType: row.dispatchType,
        estimatedInputTokens: row.estimatedInputTokens,
        estimatedOutputTokens: row.estimatedOutputTokens,
        estimatedTotalTokens: row.estimatedTotalTokens,
        estimatedCostUsd: row.estimatedCostUsd,
        estimatedPipelineTokens: row.estimatedPipelineTokens,
        estimatedPipelineCostUsd: row.estimatedPipelineCostUsd,
        selectedSourceCount: row.selectedSourceCount,
        selectedSourceNames: row.selectedSourceNames,
        importanceScore: row.importanceScore,
        localImportance: row.localImportance,
        nationalImportance: row.nationalImportance,
        globalImportance: row.globalImportance,
        geographicScope: row.geographicScope,
        isLocalProtected: row.isLocalProtected ? 1 : 0,
        evaluatedAt: row.evaluatedAt,
      })
      .onConflictDoUpdate({
        target: crawlerAiDispatchShadow.clusterId,
        set: {
          eventKey: row.eventKey,
          canonicalTitle: row.canonicalTitle,
          eligibility: row.eligibility,
          wouldDispatch: row.wouldDispatch ? 1 : 0,
          blockedReason: row.blockedReason,
          dispatchType: row.dispatchType,
          estimatedInputTokens: row.estimatedInputTokens,
          estimatedOutputTokens: row.estimatedOutputTokens,
          estimatedTotalTokens: row.estimatedTotalTokens,
          estimatedCostUsd: row.estimatedCostUsd,
          estimatedPipelineTokens: row.estimatedPipelineTokens,
          estimatedPipelineCostUsd: row.estimatedPipelineCostUsd,
          selectedSourceCount: row.selectedSourceCount,
          selectedSourceNames: row.selectedSourceNames,
          importanceScore: row.importanceScore,
          localImportance: row.localImportance,
          nationalImportance: row.nationalImportance,
          globalImportance: row.globalImportance,
          geographicScope: row.geographicScope,
          isLocalProtected: row.isLocalProtected ? 1 : 0,
          evaluatedAt: row.evaluatedAt,
        },
      })
  }

  async listShadow(opts?: { limit?: number }): Promise<CrawlerAiShadowRow[]> {
    const rows = await this.db()
      .select()
      .from(crawlerAiDispatchShadow)
      .orderBy(desc(crawlerAiDispatchShadow.evaluatedAt))
      .limit(opts?.limit ?? 200)
    return rows.map((r) => ({
      clusterId: r.clusterId,
      eventKey: r.eventKey,
      canonicalTitle: r.canonicalTitle,
      eligibility: r.eligibility,
      wouldDispatch: r.wouldDispatch === 1,
      blockedReason: r.blockedReason,
      dispatchType: r.dispatchType as CrawlerAiShadowRow['dispatchType'],
      estimatedInputTokens: r.estimatedInputTokens,
      estimatedOutputTokens: r.estimatedOutputTokens,
      estimatedTotalTokens: r.estimatedTotalTokens,
      estimatedCostUsd: r.estimatedCostUsd,
      estimatedPipelineTokens: r.estimatedPipelineTokens,
      estimatedPipelineCostUsd: r.estimatedPipelineCostUsd,
      selectedSourceCount: r.selectedSourceCount,
      selectedSourceNames: Array.isArray(r.selectedSourceNames) ? r.selectedSourceNames : [],
      importanceScore: r.importanceScore,
      localImportance: r.localImportance,
      nationalImportance: r.nationalImportance,
      globalImportance: r.globalImportance,
      geographicScope: r.geographicScope,
      isLocalProtected: r.isLocalProtected === 1,
      evaluatedAt: r.evaluatedAt,
    }))
  }

  async getBudgetWindow(
    lane: AiCostLane,
    periodType: 'hour' | 'day' | 'month',
    periodKey: string
  ): Promise<CrawlerAiBudgetWindow> {
    const rows = await this.db()
      .select()
      .from(crawlerAiBudgetWindows)
      .where(
        and(
          eq(crawlerAiBudgetWindows.lane, lane),
          eq(crawlerAiBudgetWindows.periodType, periodType),
          eq(crawlerAiBudgetWindows.periodKey, periodKey)
        )
      )
      .limit(1)
    if (rows[0]) {
      return {
        id: rows[0].id,
        lane: rows[0].lane as AiCostLane,
        periodType: rows[0].periodType as 'hour' | 'day',
        periodKey: rows[0].periodKey,
        reservedUsd: rows[0].reservedUsd,
        spentUsd: rows[0].spentUsd,
        requestCount: rows[0].requestCount,
      }
    }
    const created = emptyWindow(lane, periodType, periodKey)
    await this.db().insert(crawlerAiBudgetWindows).values({
      id: created.id,
      lane: created.lane,
      periodType: created.periodType,
      periodKey: created.periodKey,
      reservedUsd: 0,
      spentUsd: 0,
      requestCount: 0,
    })
    return created
  }

  async saveBudgetWindow(row: CrawlerAiBudgetWindow): Promise<void> {
    await this.db()
      .insert(crawlerAiBudgetWindows)
      .values({
        id: row.id,
        lane: row.lane,
        periodType: row.periodType,
        periodKey: row.periodKey,
        reservedUsd: row.reservedUsd,
        spentUsd: row.spentUsd,
        requestCount: row.requestCount,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [crawlerAiBudgetWindows.lane, crawlerAiBudgetWindows.periodType, crawlerAiBudgetWindows.periodKey],
        set: {
          reservedUsd: row.reservedUsd,
          spentUsd: row.spentUsd,
          requestCount: row.requestCount,
          updatedAt: new Date(),
        },
      })
  }

  async compareAndReserve(input: {
    lane: AiCostLane
    hour: CrawlerAiBudgetWindow
    day: CrawlerAiBudgetWindow
    nextHour: CrawlerAiBudgetWindow
    nextDay: CrawlerAiBudgetWindow
  }): Promise<boolean> {
    const hourUpd = await this.db()
      .update(crawlerAiBudgetWindows)
      .set({
        reservedUsd: input.nextHour.reservedUsd,
        requestCount: input.nextHour.requestCount,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(crawlerAiBudgetWindows.lane, input.lane),
          eq(crawlerAiBudgetWindows.periodType, 'hour'),
          eq(crawlerAiBudgetWindows.periodKey, input.hour.periodKey),
          sql`${crawlerAiBudgetWindows.reservedUsd} = ${input.hour.reservedUsd}`,
          sql`${crawlerAiBudgetWindows.requestCount} = ${input.hour.requestCount}`
        )
      )
      .returning({ id: crawlerAiBudgetWindows.id })
    if (!hourUpd[0]) return false
    const dayUpd = await this.db()
      .update(crawlerAiBudgetWindows)
      .set({
        reservedUsd: input.nextDay.reservedUsd,
        requestCount: input.nextDay.requestCount,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(crawlerAiBudgetWindows.lane, input.lane),
          eq(crawlerAiBudgetWindows.periodType, 'day'),
          eq(crawlerAiBudgetWindows.periodKey, input.day.periodKey),
          sql`${crawlerAiBudgetWindows.reservedUsd} = ${input.day.reservedUsd}`,
          sql`${crawlerAiBudgetWindows.requestCount} = ${input.day.requestCount}`
        )
      )
      .returning({ id: crawlerAiBudgetWindows.id })
    if (!dayUpd[0]) {
      await this.saveBudgetWindow(input.hour)
      return false
    }
    return true
  }

  async insertLedger(
    row: Omit<CrawlerAiLedgerRow, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }
  ): Promise<void> {
    await this.db().insert(crawlerAiCostLedger).values({
      id: row.id ?? newCrawlerId('led'),
      timestamp: row.timestamp ?? new Date(),
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
      mode: row.mode ?? null,
      reason: row.reason ?? null,
      failureCode: row.failureCode ?? null,
    })
  }

  async listLedger(opts?: { lane?: AiCostLane; since?: Date }): Promise<CrawlerAiLedgerRow[]> {
    const rows = opts?.lane
      ? await this.db()
          .select()
          .from(crawlerAiCostLedger)
          .where(
            opts.since
              ? and(eq(crawlerAiCostLedger.lane, opts.lane), gte(crawlerAiCostLedger.timestamp, opts.since))
              : eq(crawlerAiCostLedger.lane, opts.lane)
          )
          .orderBy(desc(crawlerAiCostLedger.timestamp))
          .limit(500)
      : await this.db().select().from(crawlerAiCostLedger).orderBy(desc(crawlerAiCostLedger.timestamp)).limit(500)
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      provider: r.provider,
      model: r.model,
      lane: r.lane as AiCostLane,
      jobId: r.jobId,
      clusterId: r.clusterId,
      requestType: r.requestType,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      estimatedCostUsd: r.estimatedCostUsd,
      actualCostUsd: r.actualCostUsd,
      status: r.status,
      mode: r.mode ?? null,
      reason: r.reason ?? null,
      failureCode: r.failureCode ?? null,
    }))
  }

  async getCircuit(provider: string): Promise<CrawlerAiCircuitState> {
    const rows = await this.db().select().from(crawlerAiCircuit).where(eq(crawlerAiCircuit.provider, provider)).limit(1)
    if (!rows[0]) return emptyCircuit(provider)
    return {
      provider: rows[0].provider,
      state: rows[0].state === 'OPEN' ? 'OPEN' : 'CLOSED',
      openedAt: rows[0].openedAt,
      reason: rows[0].reason,
      consecutive429: rows[0].consecutive429,
      consecutive5xx: rows[0].consecutive5xx,
      lastStatus: rows[0].lastStatus,
    }
  }

  async saveCircuit(state: CrawlerAiCircuitState): Promise<void> {
    await this.db()
      .insert(crawlerAiCircuit)
      .values({
        provider: state.provider,
        state: state.state,
        openedAt: state.openedAt,
        reason: state.reason,
        consecutive429: state.consecutive429,
        consecutive5xx: state.consecutive5xx,
        lastStatus: state.lastStatus,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: crawlerAiCircuit.provider,
        set: {
          state: state.state,
          openedAt: state.openedAt,
          reason: state.reason,
          consecutive429: state.consecutive429,
          consecutive5xx: state.consecutive5xx,
          lastStatus: state.lastStatus,
          updatedAt: new Date(),
        },
      })
  }
}
