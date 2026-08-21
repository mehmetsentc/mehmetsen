import { and, asc, desc, eq, gte, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import {
  crawlerAiBudgetWindows,
  crawlerAiCircuit,
  crawlerAiCostLedger,
  crawlerAiDispatchShadow,
  crawlerAiJobs,
  crawlerAiShadowDecisions,
  crawlerAiShadowEconomicDecisions,
} from '@/db/schema/crawler'
import { newCrawlerId } from '../store/types'
import { emptyCircuit } from './circuit'
import { emptyWindow } from './budget'
import {
  EDITORIAL_OUTPUT_TARGET,
  type AiCostLane,
  type CrawlerAiBudgetWindow,
  type CrawlerAiCircuitState,
  type CrawlerAiJobRecord,
  type CrawlerAiLedgerRow,
  type CrawlerAiShadowDecisionRow,
  type CrawlerAiShadowEconomicDecisionRow,
  type CrawlerAiShadowRow,
} from './types'
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
    failureCode: row.failureCode,
    editorialNewsId: row.editorialNewsId,
    outputTarget: EDITORIAL_OUTPUT_TARGET,
    selectedSourceCount: row.selectedSourceCount,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    lastHeartbeatAt: row.lastHeartbeatAt,
    executionId: row.executionId,
    eventRevision: row.eventRevision,
    draftSnapshot: (row.draftSnapshot as Record<string, unknown> | null) ?? null,
    validationSnapshot: (row.validationSnapshot as Record<string, unknown> | null) ?? null,
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
        failureCode: job.failureCode ?? null,
        editorialNewsId: job.editorialNewsId,
        outputTarget: job.outputTarget,
        selectedSourceCount: job.selectedSourceCount,
        leaseOwner: job.leaseOwner ?? null,
        leaseExpiresAt: job.leaseExpiresAt ?? null,
        lastHeartbeatAt: job.lastHeartbeatAt ?? null,
        executionId: job.executionId ?? null,
        eventRevision: job.eventRevision ?? null,
        draftSnapshot: job.draftSnapshot ?? null,
        validationSnapshot: job.validationSnapshot ?? null,
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

  /**
   * Phase 4F.3.1 — DB-authoritative concurrency (no JS mutex).
   * Insert then demote losers via status=BLOCKED so final active count ≤ maxConcurrent.
   * Earliest created_at wins. Neon serverless-safe (no multi-statement txn required).
   */
  async insertJobWithConcurrencyCap(
    job: CrawlerAiJobRecord,
    maxConcurrent: number
  ): Promise<'inserted' | 'duplicate' | 'concurrency_limit'> {
    const inserted = await this.insertJob(job)
    if (inserted !== 'inserted') return inserted

    const active = await this.db()
      .select({
        id: crawlerAiJobs.id,
        createdAt: crawlerAiJobs.createdAt,
      })
      .from(crawlerAiJobs)
      .where(sql`${crawlerAiJobs.status} IN ('PENDING','RESERVED','PROCESSING')`)
      .orderBy(asc(crawlerAiJobs.createdAt))

    if (active.length <= maxConcurrent) return 'inserted'

    const keep = new Set(active.slice(0, maxConcurrent).map((r) => r.id))
    if (keep.has(job.id)) return 'inserted'

    await this.updateJob(job.id, {
      status: 'BLOCKED',
      blockedReason: 'CONCURRENCY_LIMIT',
      failureCode: 'CONCURRENCY_LIMIT',
      failureReason: 'concurrent_enqueue_cap',
      completedAt: new Date(),
    })
    return 'concurrency_limit'
  }

  async updateJob(id: string, patch: Partial<CrawlerAiJobRecord>): Promise<void> {
    const {
      draftSnapshot,
      validationSnapshot,
      ...rest
    } = patch
    const values: Record<string, unknown> = { ...rest, updatedAt: new Date() }
    // neon-http: pass jsonb as serialized JSON string via cast for reliability
    if (draftSnapshot !== undefined) {
      values.draftSnapshot =
        draftSnapshot === null ? null : sql`${JSON.stringify(draftSnapshot)}::jsonb`
    }
    if (validationSnapshot !== undefined) {
      values.validationSnapshot =
        validationSnapshot === null ? null : sql`${JSON.stringify(validationSnapshot)}::jsonb`
    }
    await this.db()
      .update(crawlerAiJobs)
      .set(values as never)
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

  /**
   * Atomic claim via conditional UPDATE … RETURNING.
   * Uses indexed status lookup — no full cluster scan.
   */
  async claimNextJob(input: {
    workerId: string
    leaseExpiresAt: Date
    now: Date
  }): Promise<CrawlerAiJobRecord | null> {
    const db = this.db()
    const sel = await db
      .select({ id: crawlerAiJobs.id })
      .from(crawlerAiJobs)
      .where(
        sql`(
          ${crawlerAiJobs.status} in ('PENDING','RESERVED')
          OR (
            ${crawlerAiJobs.status} = 'PROCESSING'
            AND (${crawlerAiJobs.leaseExpiresAt} is null OR ${crawlerAiJobs.leaseExpiresAt} <= ${input.now})
            AND ${crawlerAiJobs.executionId} is null
          )
        )`
      )
      .orderBy(desc(crawlerAiJobs.priority), asc(crawlerAiJobs.createdAt))
      .limit(1)
    if (!sel[0]?.id) return null
    return this.tryClaimId(sel[0].id, input)
  }

  private async tryClaimId(
    id: string,
    input: { workerId: string; leaseExpiresAt: Date; now: Date }
  ): Promise<CrawlerAiJobRecord | null> {
    const updated = await this.db()
      .update(crawlerAiJobs)
      .set({
        status: 'PROCESSING',
        leaseOwner: input.workerId,
        leaseExpiresAt: input.leaseExpiresAt,
        lastHeartbeatAt: input.now,
        startedAt: input.now,
        attemptCount: sql`${crawlerAiJobs.attemptCount} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(crawlerAiJobs.id, id),
          sql`(
            ${crawlerAiJobs.status} in ('PENDING','RESERVED')
            OR (
              ${crawlerAiJobs.status} = 'PROCESSING'
              AND (${crawlerAiJobs.leaseExpiresAt} is null OR ${crawlerAiJobs.leaseExpiresAt} <= ${input.now})
              AND ${crawlerAiJobs.executionId} is null
            )
          )`
        )
      )
      .returning()
    return updated[0] ? mapJob(updated[0]) : null
  }

  async listClaimableJobs(opts?: { limit?: number; now?: Date }): Promise<CrawlerAiJobRecord[]> {
    const now = opts?.now ?? new Date()
    const rows = await this.db()
      .select()
      .from(crawlerAiJobs)
      .where(
        and(
          eq(crawlerAiJobs.status, 'PROCESSING'),
          sql`(${crawlerAiJobs.leaseExpiresAt} is null OR ${crawlerAiJobs.leaseExpiresAt} <= ${now})`
        )
      )
      .limit(opts?.limit ?? 20)
    return rows.map(mapJob)
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

  async insertShadowDecision(row: CrawlerAiShadowDecisionRow): Promise<void> {
    await this.db().insert(crawlerAiShadowDecisions).values({
      id: row.id,
      clusterId: row.clusterId,
      eventKey: row.eventKey,
      canonicalTitle: row.canonicalTitle,
      evaluatedAt: row.evaluatedAt,
      machineEligibility: row.machineEligibility,
      prespendOutcome: row.prespendOutcome,
      economicTier: row.economicTier,
      action: row.action,
      blockReason: row.blockReason,
      estimatedInputTokens: row.estimatedInputTokens,
      estimatedOutputTokens: row.estimatedOutputTokens,
      estimatedCostUsd: row.estimatedCostUsd,
      costKnown: row.costKnown ? 1 : 0,
      rankScore: row.rankScore,
      independentSourceCount: row.independentSourceCount,
      usableSourceWords: row.usableSourceWords,
      editorialDecisionSnapshot: row.editorialDecisionSnapshot,
      meta: row.meta,
      contentFingerprint: row.contentFingerprint ?? null,
      prespendGateVersion: row.prespendGateVersion ?? null,
      revisionKind: row.revisionKind ?? null,
      economicDecisionId: row.economicDecisionId ?? null,
    })
  }

  async listShadowDecisions(opts?: {
    limit?: number
    since?: Date
  }): Promise<CrawlerAiShadowDecisionRow[]> {
    const rows = opts?.since
      ? await this.db()
          .select()
          .from(crawlerAiShadowDecisions)
          .where(gte(crawlerAiShadowDecisions.evaluatedAt, opts.since))
          .orderBy(desc(crawlerAiShadowDecisions.evaluatedAt))
          .limit(opts?.limit ?? 500)
      : await this.db()
          .select()
          .from(crawlerAiShadowDecisions)
          .orderBy(desc(crawlerAiShadowDecisions.evaluatedAt))
          .limit(opts?.limit ?? 500)
    return rows.map((r) => ({
      id: r.id,
      clusterId: r.clusterId,
      eventKey: r.eventKey,
      canonicalTitle: r.canonicalTitle,
      evaluatedAt: r.evaluatedAt,
      machineEligibility: r.machineEligibility,
      prespendOutcome: r.prespendOutcome,
      economicTier: r.economicTier,
      action: r.action,
      blockReason: r.blockReason,
      estimatedInputTokens: r.estimatedInputTokens,
      estimatedOutputTokens: r.estimatedOutputTokens,
      estimatedCostUsd: r.estimatedCostUsd,
      costKnown: r.costKnown === 1,
      rankScore: r.rankScore,
      independentSourceCount: r.independentSourceCount,
      usableSourceWords: r.usableSourceWords,
      editorialDecisionSnapshot: r.editorialDecisionSnapshot,
      meta: (r.meta as Record<string, unknown> | null) ?? null,
      contentFingerprint: r.contentFingerprint ?? null,
      prespendGateVersion: r.prespendGateVersion ?? null,
      revisionKind: r.revisionKind ?? null,
      economicDecisionId: r.economicDecisionId ?? null,
    }))
  }

  async tryInsertShadowEconomicDecision(
    row: CrawlerAiShadowEconomicDecisionRow
  ): Promise<{ inserted: boolean; row: CrawlerAiShadowEconomicDecisionRow }> {
    try {
      await this.db().insert(crawlerAiShadowEconomicDecisions).values({
        id: row.id,
        clusterId: row.clusterId,
        contentFingerprint: row.contentFingerprint,
        prespendGateVersion: row.prespendGateVersion,
        revisionKind: row.revisionKind,
        eventKey: row.eventKey,
        canonicalTitle: row.canonicalTitle,
        firstEvaluatedAt: row.firstEvaluatedAt,
        lastEvaluatedAt: row.lastEvaluatedAt,
        evaluationCount: row.evaluationCount,
        machineEligibility: row.machineEligibility,
        prespendOutcome: row.prespendOutcome,
        economicTier: row.economicTier,
        action: row.action,
        blockReason: row.blockReason,
        estimatedInputTokens: row.estimatedInputTokens,
        estimatedOutputTokens: row.estimatedOutputTokens,
        estimatedCostUsd: row.estimatedCostUsd,
        costKnown: row.costKnown ? 1 : 0,
        rankScore: row.rankScore,
        independentSourceCount: row.independentSourceCount,
        usableSourceWords: row.usableSourceWords,
        editorialDecisionSnapshot: row.editorialDecisionSnapshot,
        meta: row.meta,
      })
      return { inserted: true, row }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/unique|duplicate/i.test(msg)) throw err
      const existing = await this.db()
        .select()
        .from(crawlerAiShadowEconomicDecisions)
        .where(
          and(
            eq(crawlerAiShadowEconomicDecisions.clusterId, row.clusterId),
            eq(crawlerAiShadowEconomicDecisions.contentFingerprint, row.contentFingerprint),
            eq(crawlerAiShadowEconomicDecisions.prespendGateVersion, row.prespendGateVersion)
          )
        )
        .limit(1)
      const cur = existing[0]
      if (!cur) throw err
      await this.db()
        .update(crawlerAiShadowEconomicDecisions)
        .set({
          lastEvaluatedAt: row.lastEvaluatedAt,
          evaluationCount: (cur.evaluationCount || 1) + 1,
        })
        .where(eq(crawlerAiShadowEconomicDecisions.id, cur.id))
      return {
        inserted: false,
        row: {
          id: cur.id,
          clusterId: cur.clusterId,
          contentFingerprint: cur.contentFingerprint,
          prespendGateVersion: cur.prespendGateVersion,
          revisionKind: cur.revisionKind,
          eventKey: cur.eventKey,
          canonicalTitle: cur.canonicalTitle,
          firstEvaluatedAt: cur.firstEvaluatedAt,
          lastEvaluatedAt: row.lastEvaluatedAt,
          evaluationCount: (cur.evaluationCount || 1) + 1,
          machineEligibility: cur.machineEligibility,
          prespendOutcome: cur.prespendOutcome,
          economicTier: cur.economicTier,
          action: cur.action,
          blockReason: cur.blockReason,
          estimatedInputTokens: cur.estimatedInputTokens,
          estimatedOutputTokens: cur.estimatedOutputTokens,
          estimatedCostUsd: cur.estimatedCostUsd,
          costKnown: cur.costKnown === 1,
          rankScore: cur.rankScore,
          independentSourceCount: cur.independentSourceCount,
          usableSourceWords: cur.usableSourceWords,
          editorialDecisionSnapshot: cur.editorialDecisionSnapshot,
          meta: (cur.meta as Record<string, unknown> | null) ?? null,
        },
      }
    }
  }

  async listShadowEconomicDecisions(opts?: {
    limit?: number
    since?: Date
  }): Promise<CrawlerAiShadowEconomicDecisionRow[]> {
    const rows = opts?.since
      ? await this.db()
          .select()
          .from(crawlerAiShadowEconomicDecisions)
          .where(gte(crawlerAiShadowEconomicDecisions.firstEvaluatedAt, opts.since))
          .orderBy(desc(crawlerAiShadowEconomicDecisions.firstEvaluatedAt))
          .limit(opts?.limit ?? 500)
      : await this.db()
          .select()
          .from(crawlerAiShadowEconomicDecisions)
          .orderBy(desc(crawlerAiShadowEconomicDecisions.firstEvaluatedAt))
          .limit(opts?.limit ?? 500)
    return rows.map((r) => ({
      id: r.id,
      clusterId: r.clusterId,
      contentFingerprint: r.contentFingerprint,
      prespendGateVersion: r.prespendGateVersion,
      revisionKind: r.revisionKind,
      eventKey: r.eventKey,
      canonicalTitle: r.canonicalTitle,
      firstEvaluatedAt: r.firstEvaluatedAt,
      lastEvaluatedAt: r.lastEvaluatedAt,
      evaluationCount: r.evaluationCount,
      machineEligibility: r.machineEligibility,
      prespendOutcome: r.prespendOutcome,
      economicTier: r.economicTier,
      action: r.action,
      blockReason: r.blockReason,
      estimatedInputTokens: r.estimatedInputTokens,
      estimatedOutputTokens: r.estimatedOutputTokens,
      estimatedCostUsd: r.estimatedCostUsd,
      costKnown: r.costKnown === 1,
      rankScore: r.rankScore,
      independentSourceCount: r.independentSourceCount,
      usableSourceWords: r.usableSourceWords,
      editorialDecisionSnapshot: r.editorialDecisionSnapshot,
      meta: (r.meta as Record<string, unknown> | null) ?? null,
    }))
  }

  async hasShadowEconomicDecisionForCluster(clusterId: string): Promise<boolean> {
    const rows = await this.db()
      .select({ id: crawlerAiShadowEconomicDecisions.id })
      .from(crawlerAiShadowEconomicDecisions)
      .where(eq(crawlerAiShadowEconomicDecisions.clusterId, clusterId))
      .limit(1)
    return Boolean(rows[0])
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
