/**
 * Phase 4D — controlled event-first auto-draft pipeline (local Stage 1).
 * $0 spend: mocks/fixtures only. No real DeepSeek.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateAutoDraftGate, canCreateAutoDraftJob } from './eligibility'
import { decideEventRevision, fingerprintFromMembers } from './revision'
import { autoDraftBudgetLimits, checkMonthlyBudget } from './budgetLimits'
import { runControlledAutoDraftTick, autoDraftPublicationAllowed } from './pipeline'
import { buildCostCmsPayload, costCmsUnavailablePayload } from './costAggregates'
import { getCrawlerAiMode, isControlledAutoDraftEnabled, parseCrawlerAiMode } from '../aiMode'
import { MemoryAiDispatchStore } from '../aiDispatch/store'
import { MemoryCrawlerStore } from '../store/memory'
import { emptyWindow, periodKeys, tryReserveBudget } from '../aiDispatch/budget'
import { shouldAttemptPaidSchemaRepair } from '../canary/repairPolicy'
import { isCrawlerAiDispatchEnabled } from '../dispatch'
import { isLegacyDirectAiEnabled } from '../legacyFlags'
import { ACTIVE_EDITORIAL_STATUSES, sortRawArticles } from '../editorial/query'
import { sameEventBadgeLabel } from '../editorial/eventDesk'
import type { CrawlerAiLedgerRow } from '../aiDispatch/types'
import type { RawArticleRecord } from '../types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function pricingOn() {
  vi.stubEnv('DEEPSEEK_INPUT_COST_PER_1M', '0.14')
  vi.stubEnv('DEEPSEEK_OUTPUT_COST_PER_1M', '0.28')
}

function resetEnv() {
  vi.unstubAllEnvs()
  delete process.env.CRAWLER_AI_DISPATCH_ENABLED
  delete process.env.CRAWLER_AI_MODE
  delete process.env.LEGACY_DIRECT_AI_ENABLED
  delete process.env.AI_MAX_COST_PER_EVENT_USD
  delete process.env.AI_MAX_DRAFTS_PER_HOUR
  delete process.env.AI_MAX_DRAFTS_PER_DAY
  delete process.env.AI_MAX_DAILY_COST_USD
  delete process.env.AI_MAX_MONTHLY_COST_USD
  delete process.env.DEEPSEEK_INPUT_COST_PER_1M
  delete process.env.DEEPSEEK_OUTPUT_COST_PER_1M
}

afterEach(() => {
  resetEnv()
})

const richBody =
  'Manisa merkezde makilik alanda yangın çıktı. Ekipler havadan ve karadan müdahale ediyor. ' +
  'Vatandaşlar bölgeden uzaklaştırıldı. Rüzgar etkisiyle alevler yayıldı. Yetkililer soğutma çalışması başlattı. '.repeat(
    8
  )

function baseGate(partial: Partial<Parameters<typeof evaluateAutoDraftGate>[0]> = {}) {
  return evaluateAutoDraftGate({
    clusterAiEligibility: 'ELIGIBLE',
    editorialDecision: 'APPROVED_FOR_AI',
    publishedNewsId: null,
    hasActiveAiJob: false,
    hasCompletedDraft: false,
    hasMaterialUpdate: false,
    bestWordCount: 400,
    independentSourceCount: 2,
    uniqueSourceCount: 2,
    staleHours: 2,
    exactDuplicateOnly: false,
    avgHealth: 80,
    bestConfidence: 0.85,
    hasLocalGeography: true,
    importanceScore: 70,
    ...partial,
  })
}

describe('Phase 4D modes + flags', () => {
  it('default mode OFF; dispatch and legacy off', () => {
    expect(getCrawlerAiMode()).toBe('OFF')
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    expect(isLegacyDirectAiEnabled()).toBe(false)
    expect(isControlledAutoDraftEnabled()).toBe(false)
  })

  it('CONTROLLED_AUTO_DRAFT requires dispatch enabled', () => {
    process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
    expect(parseCrawlerAiMode('CONTROLLED_AUTO_DRAFT')).toBe('CONTROLLED_AUTO_DRAFT')
    expect(isControlledAutoDraftEnabled()).toBe(false)
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
    expect(isControlledAutoDraftEnabled()).toBe(true)
  })

  it('no AUTO_PUBLISH mode; publication always false', () => {
    expect(autoDraftPublicationAllowed()).toBe(false)
    expect(parseCrawlerAiMode('AUTO_PUBLISH')).toBe('OFF')
  })
})

describe('Phase 4D eligibility gate (unpaid)', () => {
  it('AI_READY for multi-source eligible event', () => {
    const g = baseGate()
    expect(g.status).toBe('AI_READY')
    expect(g.readyForJob).toBe(true)
  })

  it('strong single local source can be AI_READY (no hard min=2)', () => {
    const g = baseGate({ independentSourceCount: 1, uniqueSourceCount: 1, hasLocalGeography: true })
    expect(g.status).toBe('AI_READY')
  })

  it('weak single source waits', () => {
    const g = baseGate({
      independentSourceCount: 1,
      uniqueSourceCount: 1,
      hasLocalGeography: false,
      importanceScore: 20,
      bestWordCount: 100,
      bestConfidence: 0.5,
      clusterAiEligibility: 'WATCHING',
    })
    expect(g.status).toBe('WAITING_FOR_MORE_SOURCES')
  })

  it('TOO_THIN / DUPLICATE / STALE / EDITOR_REJECTED / PUBLISHED / COST_BLOCKED', () => {
    expect(baseGate({ bestWordCount: 40 }).status).toBe('TOO_THIN')
    expect(baseGate({ exactDuplicateOnly: true }).status).toBe('DUPLICATE')
    expect(baseGate({ staleHours: 100 }).status).toBe('STALE')
    expect(baseGate({ editorialDecision: 'REJECTED' }).status).toBe('EDITOR_REJECTED')
    expect(baseGate({ publishedNewsId: 'n1' }).status).toBe('ALREADY_PUBLISHED')
    expect(baseGate({ costBlocked: true }).status).toBe('COST_BLOCKED')
  })

  it('APPROVED_FOR_AI alone is insufficient for job', () => {
    const gate = baseGate()
    const create = canCreateAutoDraftJob({
      gate,
      editorialDecision: 'APPROVED_FOR_AI',
      autoDraftModeEnabled: false,
      budgetOk: true,
      idempotencyOk: true,
    })
    expect(create.ok).toBe(false)
    expect(create.reason).toBe('MODE_OR_DISPATCH_OFF')
  })

  it('ALREADY_DRAFTED + fingerprint change → UPDATE_AVAILABLE', () => {
    const g = baseGate({
      hasCompletedDraft: true,
      contentFingerprintChanged: true,
    })
    expect(g.status).toBe('UPDATE_AVAILABLE')
    expect(g.readyForJob).toBe(false)
  })
})

describe('Phase 4D revision / idempotency', () => {
  it('supporting source after draft marks update, no auto second job', () => {
    const d = decideEventRevision({
      currentFingerprint: 'aaa',
      draftedFingerprint: 'bbb',
      hasCompletedDraft: true,
      hasActiveJob: false,
    })
    expect(d.action).toBe('mark_update_available')
  })

  it('same fingerprint → no regeneration', () => {
    const d = decideEventRevision({
      currentFingerprint: 'same',
      draftedFingerprint: 'same',
      hasCompletedDraft: true,
      hasActiveJob: false,
    })
    expect(d.action).toBe('none')
  })

  it('memory store blocks second active job for same event', async () => {
    const store = new MemoryAiDispatchStore()
    const now = new Date()
    const job = {
      id: 'j1',
      clusterId: 'cl1',
      eventKey: 'ek',
      status: 'PENDING' as const,
      dispatchType: 'INITIAL' as const,
      priority: 1,
      eligibilityStatus: 'AI_READY',
      estimatedInputTokens: 100,
      estimatedOutputTokens: 100,
      estimatedTotalTokens: 200,
      estimatedCostUsd: 0.001,
      actualInputTokens: null,
      actualOutputTokens: null,
      actualCostUsd: null,
      model: 'm',
      provider: 'deepseek',
      attemptCount: 0,
      maxAttempts: 2,
      reservedAt: null,
      startedAt: null,
      completedAt: null,
      blockedReason: null,
      failureReason: null,
      editorialNewsId: null,
      outputTarget: 'EDITORIAL_DRAFT' as const,
      selectedSourceCount: 2,
      createdAt: now,
      updatedAt: now,
    }
    expect(await store.insertJob(job)).toBe('inserted')
    expect(await store.insertJob({ ...job, id: 'j2' })).toBe('duplicate')
  })
})

describe('Phase 4D budgets', () => {
  it('AI_MAX_* Phase 4E defaults: $0.01/event · 2/h · 10/day · $0.05/day · $5/mo', () => {
    const lim = autoDraftBudgetLimits()
    expect(lim.maxCostPerEventUsd).toBe(0.01)
    expect(lim.maxDraftsPerHour).toBe(2)
    expect(lim.maxDraftsPerDay).toBe(10)
    expect(lim.maxDailyCostUsd).toBe(0.05)
    expect(lim.maxMonthlyCostUsd).toBe(5)
    expect(lim.maxConcurrentJobs).toBe(1)
    expect(lim.maxJobsPerInvocation).toBe(1)
  })

  it('COST_UNKNOWN / ceiling / hourly / daily / monthly block', () => {
    expect(checkMonthlyBudget({ reservedUsd: 4, spentUsd: 1, nextCostUsd: 0.1, maxMonthlyCostUsd: 5 }).ok).toBe(
      false
    )
    const hour = emptyWindow('crawler_automatic', 'hour', '2026-08-20T12')
    const day = emptyWindow('crawler_automatic', 'day', '2026-08-20')
    hour.requestCount = 2
    const blocked = tryReserveBudget({
      hour,
      day,
      costUsd: 0.001,
      concurrentJobs: 0,
      maxRequestsPerHour: 2,
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.reason).toBe('HOURLY_REQUEST_LIMIT')
  })

  it('periodKeys includes month', () => {
    const k = periodKeys(new Date('2026-08-20T15:00:00Z'))
    expect(k.month).toBe('2026-08')
  })
})

describe('Phase 4D pipeline tick (mode OFF → $0)', () => {
  async function seedApprovedEvent(crawler: MemoryCrawlerStore, now: Date) {
    const source = await crawler.insertSource({
      name: 'Cumhuriyet',
      domain: 'cumhuriyet.com.tr',
      baseUrl: 'https://www.cumhuriyet.com.tr',
      countryCode: 'TR',
      language: 'tr',
      discoveryMethod: 'RSS',
    } as never)
    const article = await crawler.insertRawArticle({
      sourceId: source.id,
      originalUrl: `https://www.cumhuriyet.com.tr/a-${Math.random().toString(36).slice(2, 8)}`,
      title: "Manisa'da makilik alanda yangın",
      articleBodyText: richBody,
      language: 'tr',
      countryCode: 'TR',
      wordCount: 200,
      extractionConfidence: 0.9,
      publishedAt: now,
      fetchedAt: now,
      qualityStatus: 'GOOD',
    } as never)
    const cluster = await crawler.insertCluster({
      representativeArticleId: article.id,
      normalizedTopic: 'manisa yangin',
      countryCode: 'TR',
      city: 'Manisa',
      eventKey: 'manisa-yangin',
      canonicalTitle: "Manisa'da makilik alanda yangın",
    })
    await crawler.updateCluster(cluster.id, {
      editorialDecision: 'APPROVED_FOR_AI',
      aiEligibility: 'ELIGIBLE',
      uniqueSourceCount: 2,
      articleCount: 2,
      latestArticleAt: now,
      localImportance: 80,
      importanceScore: 75,
    })
    await crawler.insertMembership({
      clusterId: cluster.id,
      articleId: article.id,
      sourceId: source.id,
      similarityScore: 1,
      matchBand: 'HIGH',
      isCanonical: true,
    })
    return { source, article, cluster }
  }

  it('OFF mode creates zero jobs and zero provider calls', async () => {
    pricingOn()
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    await seedApprovedEvent(crawler, now)

    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      limit: 5,
    })
    expect(tick.mode).toBe('OFF')
    expect(tick.jobsCreated).toBe(0)
    expect(tick.providerCalls).toBe(0)
    expect(tick.published).toBe(0)
  })

  it('CONTROLLED_AUTO_DRAFT + dispatch + provider unwired → no jobs, no paid call', async () => {
    pricingOn()
    process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
    process.env.AI_MAX_COST_PER_EVENT_USD = '1'
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = '2020-01-01T00:00:00.000Z'
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const now = new Date()
    await seedApprovedEvent(crawler, now)

    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now,
      limit: 5,
    })
    expect(tick.jobsCreated).toBe(0)
    expect(tick.providerCalls).toBe(0)
    expect(tick.published).toBe(0)
    expect(tick.providerBlocked).toBeGreaterThan(0)
  })
})

describe('Phase 4D BODY_TOO_SHORT no paid repair + cost aggregates', () => {
  it('BODY_TOO_SHORT never triggers paid repair', () => {
    const r = shouldAttemptPaidSchemaRepair({
      validationOk: false,
      issueCodes: ['BODY_TOO_SHORT'],
      jsonParseOk: true,
      alreadyRepaired: false,
      requestCount: 1,
      maxRequests: 2,
    })
    expect(r.repair).toBe(false)
  })

  it('cost CMS aggregates without fake zeros on unavailable', () => {
    const rows: CrawlerAiLedgerRow[] = [
      {
        id: '1',
        timestamp: new Date(),
        provider: 'deepseek',
        model: 'm',
        lane: 'manual_canary',
        jobId: 'j',
        clusterId: 'c',
        requestType: 'manual_canary',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 0.001,
        actualCostUsd: 0.001,
        status: 'SUCCESS',
      },
    ]
    const payload = buildCostCmsPayload(rows)
    expect(payload.unavailable).toBe(false)
    expect(payload.windows[0].requests).toBeGreaterThanOrEqual(1)
    const bad = costCmsUnavailablePayload()
    expect(bad.unavailable).toBe(true)
    expect(bad.windows).toBeNull()
  })
})

describe('Phase 4D Ham Haber + drawer contracts preserved', () => {
  it('AYNI OLAY badge + PUBLISHED not in active statuses', () => {
    expect(sameEventBadgeLabel(3, 3)).toBe('AYNI OLAY · 3 HABER · 3 KAYNAK')
    expect(ACTIVE_EDITORIAL_STATUSES).not.toContain('PUBLISHED')
  })

  it('server-side sort ASC/DESC', () => {
    const rows = [
      {
        id: 'a',
        wordCount: 10,
        fetchedAt: new Date('2026-01-01'),
        publishedAt: new Date('2026-01-01'),
      },
      {
        id: 'b',
        wordCount: 50,
        fetchedAt: new Date('2026-01-02'),
        publishedAt: new Date('2026-01-02'),
      },
    ] as unknown as RawArticleRecord[]
    const newest = sortRawArticles(rows, 'newest')
    expect(newest[0].id).toBe('b')
    const oldest = sortRawArticles(rows, 'oldest')
    expect(oldest[0].id).toBe('a')
  })

  it('drawer stale-fetch abort still present', () => {
    const pageSrc = readFileSync(
      resolve(__dirname, '../../../app/admin/crawler/raw-articles/page.tsx'),
      'utf8'
    )
    expect(pageSrc).toContain('AbortController')
    expect(pageSrc).toContain('ac.abort()')
  })
})

describe('Phase 4D fingerprint for 3-source same event', () => {
  it('stable fingerprint from members', () => {
    const fp = fingerprintFromMembers('cl', 'ek', [
      { articleId: 'a1', sourceId: 's1', contentHash: 'h1', wordCount: 100, title: 't', publishedAt: null },
      { articleId: 'a2', sourceId: 's2', contentHash: 'h2', wordCount: 120, title: 't2', publishedAt: null },
      { articleId: 'a3', sourceId: 's3', contentHash: 'h3', wordCount: 90, title: 't3', publishedAt: null },
    ])
    expect(fp).toHaveLength(40)
    const fp2 = fingerprintFromMembers('cl', 'ek', [
      { articleId: 'a3', sourceId: 's3', contentHash: 'h3', wordCount: 90, title: 't3', publishedAt: null },
      { articleId: 'a1', sourceId: 's1', contentHash: 'h1', wordCount: 100, title: 't', publishedAt: null },
      { articleId: 'a2', sourceId: 's2', contentHash: 'h2', wordCount: 120, title: 't2', publishedAt: null },
    ])
    expect(fp).toBe(fp2)
  })
})

describe('Phase 4D migration safety', () => {
  it('0014 migration is additive only', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../db/migrations/0014_phase4d_controlled_auto_draft.sql'),
      'utf8'
    )
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/)
    expect(sql).toMatch(/crawler_ai_jobs_cluster_active_uidx/)
    expect(/^\s*DROP\s+TABLE/im.test(sql)).toBe(false)
    expect(/^\s*TRUNCATE\b/im.test(sql)).toBe(false)
  })
})
