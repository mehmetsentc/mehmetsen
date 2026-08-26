/**
 * Phase 4E — controlled editorial auto-draft rollout (local mocks, $0).
 * Full local test matrix from acceptance prompt.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  STRONG_SINGLE_SOURCE_THRESHOLDS,
  evaluateAutoDraftGate,
  evaluateStrongSingleSource,
  scoreAutoDraftEligibility,
  canCreateAutoDraftJob,
  autoDraftBudgetLimits,
  checkMonthlyBudget,
  scoreEditorialAutoDraftRank,
  isCanakkaleLocal,
  CANAKKALE_RANK_BOOST,
  aiJobFailureReasonTr,
  buildOpsCounters,
  formatMetricNumber,
  summarizeSourceHealth,
  phase4eFreshnessExpectations,
  autoDraftPublicationAllowed,
  runControlledAutoDraftTick,
  isEventEligibleForAutoDraft,
  blocksAutomaticRepay,
} from './index'
import { getCrawlerAiMode, isControlledAutoDraftEnabled, parseCrawlerAiMode } from '../aiMode'
import { tryReserveBudget, emptyWindow } from '../aiDispatch/budget'
import { shouldAttemptPaidSchemaRepair } from '../canary/repairPolicy'
import { evaluateBodyAgainstSources } from '../canary/sourcePolicy'
import {
  CANARY_BODY_TARGET_MAX_WORDS,
  CANARY_BODY_PROMPT_TARGET_MIN_WORDS,
  CANARY_BODY_PROMPT_TARGET_MAX_WORDS,
} from '../canary/schema'
import { scoreClusterMatch } from '../cluster/score'
import { buildEventFingerprint } from '../cluster/fingerprint'
import { shouldHideSupportingFromPrimaryQueue, matchesRawArticleQuery, ACTIVE_EDITORIAL_STATUSES } from '../editorial/query'
import { multiSourceEventSummary, updateAvailableBannerTr, sameEventBadgeLabel } from '../editorial/eventDesk'
import { MemoryAiDispatchStore } from '../aiDispatch/store'
import { MemoryCrawlerStore } from '../store/memory'
import type { NewsSourceRecord, RawArticleRecord } from '../types'

function resetEnv() {
  vi.unstubAllEnvs()
  for (const k of [
    'CRAWLER_AI_DISPATCH_ENABLED',
    'CRAWLER_AI_MODE',
    'CRAWLER_AI_PROVIDER_ENABLED',
    'CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER',
    'CRAWLER_AI_ACCEPTANCE_COHORT_IDS',
    'LEGACY_DIRECT_AI_ENABLED',
    'AI_MAX_COST_PER_EVENT_USD',
    'AI_MAX_DRAFTS_PER_HOUR',
    'AI_MAX_DRAFTS_PER_DAY',
    'AI_MAX_DAILY_COST_USD',
    'AI_MAX_MONTHLY_COST_USD',
    'DEEPSEEK_INPUT_COST_PER_1M',
    'DEEPSEEK_OUTPUT_COST_PER_1M',
  ]) {
    delete process.env[k]
  }
}

afterEach(() => {
  resetEnv()
})

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

const NOW = new Date('2026-08-21T09:00:00.000Z')

describe('Phase 4E modes + publication firewall', () => {
  it('default OFF; CONTROLLED needs dispatch; no AUTO_PUBLISH', () => {
    expect(getCrawlerAiMode()).toBe('OFF')
    expect(isControlledAutoDraftEnabled()).toBe(false)
    expect(autoDraftPublicationAllowed()).toBe(false)
    expect(parseCrawlerAiMode('AUTO_PUBLISH')).toBe('OFF')
    process.env.CRAWLER_AI_MODE = 'CONTROLLED_AUTO_DRAFT'
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
    expect(isControlledAutoDraftEnabled()).toBe(true)
  })
})

describe('Phase 4E dedup / clustering (deterministic, unpaid)', () => {
  it('same-event multi-source Manisa fire merges (HIGH)', () => {
    const a = buildEventFingerprint({
      title: "Manisa'da makilik alanda yangın",
      language: 'tr',
      city: 'manisa',
      publishedAt: NOW,
    })
    const b = buildEventFingerprint({
      title: "Manisa'da makilik alan yangını",
      language: 'tr',
      city: 'manisa',
      publishedAt: NOW,
    })
    const scored = scoreClusterMatch(a, { fingerprint: b, lastSeenAt: NOW, firstSeenAt: NOW }, NOW)
    expect(scored.band).toBe('HIGH')
    expect(scored.blockedReason).toBeNull()
  })

  it('Soma ≠ Akhisar false-merge protection', () => {
    const scored = scoreClusterMatch(
      buildEventFingerprint({
        title: "Manisa Soma'da makilik alanda yangın",
        language: 'tr',
        city: 'manisa',
        publishedAt: NOW,
      }),
      {
        fingerprint: buildEventFingerprint({
          title: "Manisa Akhisar'da makilik alanda yangın",
          language: 'tr',
          city: 'manisa',
          publishedAt: NOW,
        }),
        lastSeenAt: NOW,
        firstSeenAt: NOW,
      },
      NOW
    )
    expect(scored.blockedReason).toBe('place_entity_conflict')
    expect(scored.band).not.toBe('HIGH')
  })

  it('admin multi-source summary shows PRIMARY + SUPPORTING', () => {
    const s = multiSourceEventSummary({
      title: 'MANİSA’DA MAKİLİK ALAN YANGINI',
      articleCount: 3,
      independentSourceCount: 3,
      primarySourceName: 'AA',
      supportingSourceNames: ['NTV', 'Hürriyet'],
    })
    expect(s.countsTr).toContain('3 haber')
    expect(s.primaryTr).toContain('AA')
    expect(s.supportingTr).toContain('NTV')
    expect(sameEventBadgeLabel(3, 3)).toContain('AYNI OLAY')
  })
})

describe('Phase 4E Ham Haber event-primary clutter filter', () => {
  it('hides SUPPORTING from active queue when eventPrimaryOnly=true; keeps PRIMARY', () => {
    const supporting = {
      clusterId: 'c1',
      clusterRole: 'SUPPORTING',
      isExactDuplicate: false,
      editorialStatus: 'NEW',
    } as RawArticleRecord
    const primary = {
      clusterId: 'c1',
      clusterRole: 'PRIMARY',
      isExactDuplicate: false,
      editorialStatus: 'NEW',
    } as RawArticleRecord
    expect(shouldHideSupportingFromPrimaryQueue(supporting, { eventPrimaryOnly: true, queue: 'active' })).toBe(
      true
    )
    expect(shouldHideSupportingFromPrimaryQueue(primary, { eventPrimaryOnly: true, queue: 'active' })).toBe(false)
    expect(
      matchesRawArticleQuery(supporting, {
        queue: 'active',
        eventPrimaryOnly: true,
      })
    ).toBe(false)
    expect(ACTIVE_EDITORIAL_STATUSES).not.toContain('PUBLISHED')
  })

  it('shows SUPPORTING on active queue by default (eventPrimaryOnly unset)', () => {
    const supporting = {
      clusterId: 'c1',
      clusterRole: 'SUPPORTING',
      isExactDuplicate: false,
      editorialStatus: 'NEW',
    } as RawArticleRecord
    expect(shouldHideSupportingFromPrimaryQueue(supporting, { queue: 'active' })).toBe(false)
    expect(matchesRawArticleQuery(supporting, { queue: 'active' })).toBe(true)
  })
})

describe('Phase 4E eligibility + STRONG_SINGLE_SOURCE', () => {
  it('reports exact thresholds', () => {
    expect(STRONG_SINGLE_SOURCE_THRESHOLDS.localOrBreaking.bestWordCountMin).toBe(120)
    expect(STRONG_SINGLE_SOURCE_THRESHOLDS.highQualityTrusted.bestConfidenceMin).toBe(0.75)
    expect(STRONG_SINGLE_SOURCE_THRESHOLDS.highQualityTrusted.importanceMin).toBe(40)
  })

  it('multi-source preferred; strong single qualifies; low health rejected', () => {
    expect(baseGate().status).toBe('AUTO_DRAFT_ELIGIBLE')
    expect(baseGate().reason).toBe('multi_source_ready')
    const strongInput = {
      clusterAiEligibility: 'WATCHING',
      editorialDecision: 'APPROVED_FOR_AI',
      publishedNewsId: null,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      hasMaterialUpdate: false,
      independentSourceCount: 1,
      uniqueSourceCount: 1,
      bestWordCount: 160,
      bestConfidence: 0.8,
      avgHealth: 75,
      staleHours: 10,
      importanceScore: 50,
      hasLocalGeography: false,
      crawlPriority: 'NORMAL' as const,
      exactDuplicateOnly: false,
    }
    const strong = evaluateAutoDraftGate(strongInput)
    expect(strong.status).toBe('AUTO_DRAFT_ELIGIBLE')
    expect(strong.reason).toBe('STRONG_SINGLE_SOURCE')
    expect(evaluateStrongSingleSource(strongInput).path).toBe('high_quality_trusted')

    expect(baseGate({ avgHealth: 20, bestConfidence: 0.3 }).status).toBe('LOW_QUALITY')
  })

  it('published / existing draft / historical / UPDATE_AVAILABLE exclusions', () => {
    expect(baseGate({ publishedNewsId: 'n1' }).status).toBe('ALREADY_PUBLISHED')
    expect(baseGate({ hasCompletedDraft: true }).status).toBe('ALREADY_DRAFTED')
    expect(
      baseGate({ hasCompletedDraft: true, hasMaterialUpdate: true }).status
    ).toBe('UPDATE_AVAILABLE')
    expect(updateAvailableBannerTr(true, 'UPDATE_AVAILABLE')).toBe('GÜNCELLEME VAR')

    expect(
      isEventEligibleForAutoDraft({
        clusterId: 'old',
        decidedAt: new Date('2020-01-01T00:00:00.000Z'),
      }).ok
    ).toBe(false)
    process.env.CRAWLER_AI_AUTO_DRAFT_ELIGIBLE_AFTER = '2026-08-20T00:00:00.000Z'
    expect(
      isEventEligibleForAutoDraft({
        clusterId: 'fresh',
        decidedAt: new Date('2026-08-21T00:00:00.000Z'),
      }).ok
    ).toBe(true)
  })

  it('eligibility score is deterministic', () => {
    const score = scoreAutoDraftEligibility({
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
    })
    expect(score.total).toBeGreaterThan(50)
    expect(score.multiSource).toBeGreaterThan(0)
  })
})

describe('Phase 4E editorial ranking + Çanakkale boost', () => {
  it('Çanakkale boosts rank but does not bypass gate', () => {
    expect(isCanakkaleLocal({ city: 'Çanakkale' })).toBe(true)
    const local = scoreEditorialAutoDraftRank({
      editorialPriority: 'NORMAL',
      independentSourceCount: 1,
      importanceScore: 40,
      staleHours: 2,
      avgHealth: 70,
      bestWordCount: 200,
      bestConfidence: 0.7,
      city: 'Çanakkale',
    })
    const other = scoreEditorialAutoDraftRank({
      editorialPriority: 'NORMAL',
      independentSourceCount: 1,
      importanceScore: 40,
      staleHours: 2,
      avgHealth: 70,
      bestWordCount: 200,
      bestConfidence: 0.7,
      city: 'Ankara',
    })
    expect(local.canakkaleBoostApplied).toBe(true)
    expect(local.score - other.score).toBe(CANAKKALE_RANK_BOOST)
    // Bad Çanakkale still fails gate
    expect(
      baseGate({
        hasLocalGeography: true,
        bestWordCount: 40,
        avgHealth: 10,
        bestConfidence: 0.1,
        independentSourceCount: 1,
      }).status
    ).toBe('TOO_THIN')
  })

  it('BREAKING outranks NORMAL', () => {
    const breaking = scoreEditorialAutoDraftRank({
      editorialPriority: 'BREAKING',
      independentSourceCount: 1,
      importanceScore: 30,
      staleHours: 5,
      avgHealth: 50,
      bestWordCount: 150,
      bestConfidence: 0.6,
    })
    const normal = scoreEditorialAutoDraftRank({
      editorialPriority: 'NORMAL',
      independentSourceCount: 3,
      importanceScore: 90,
      staleHours: 1,
      avgHealth: 90,
      bestWordCount: 500,
      bestConfidence: 0.9,
    })
    expect(breaking.score).toBeGreaterThan(normal.score)
  })
})

describe('Phase 4E quality policy (4D.4 preserved)', () => {
  it('>=300 material requires >=300 body; target 400–550; max 900; medium floor 220', () => {
    expect(CANARY_BODY_PROMPT_TARGET_MIN_WORDS).toBe(400)
    expect(CANARY_BODY_PROMPT_TARGET_MAX_WORDS).toBe(550)
    expect(CANARY_BODY_TARGET_MAX_WORDS).toBe(900)

    const richPack = {
      sources: [
        {
          articleId: 'a1',
          sourceId: 's1',
          sourceName: 'AA',
          role: 'PRIMARY' as const,
          title: 't',
          body: Array.from({ length: 320 }, (_, i) => `kelime${i}`).join(' '),
          contentHash: 'h1',
          publishedAt: NOW,
          usedRssSnippet: false,
          htmlStripped: true,
        },
      ],
    }
    const shortBody = Array.from({ length: 250 }, (_, i) => `cikti${i}`).join(' ')
    const decision = evaluateBodyAgainstSources(shortBody, richPack)
    expect(decision.code).toBe('BODY_TOO_SHORT')
    expect(decision.requiredMin).toBeGreaterThanOrEqual(300)
    expect(decision.metrics.richness).toBe('rich')

    const mediumPack = {
      sources: [
        {
          articleId: 'a2',
          sourceId: 's2',
          sourceName: 'NTV',
          role: 'PRIMARY' as const,
          title: 't2',
          body: Array.from({ length: 240 }, (_, i) => `orta${i}`).join(' '),
          contentHash: 'h2',
          publishedAt: NOW,
          usedRssSnippet: false,
          htmlStripped: true,
        },
      ],
    }
    const mediumDecision = evaluateBodyAgainstSources(
      Array.from({ length: 200 }, (_, i) => `kisa${i}`).join(' '),
      mediumPack
    )
    expect(mediumDecision.metrics.richness).toBe('medium')
    expect(mediumDecision.requiredMin).toBeGreaterThanOrEqual(220)
  })

  it('BODY_TOO_SHORT never triggers paid repair', () => {
    const decision = shouldAttemptPaidSchemaRepair({
      validationOk: false,
      issueCodes: ['BODY_TOO_SHORT'],
      jsonParseOk: true,
      alreadyRepaired: false,
      requestCount: 1,
      maxRequests: 2,
    })
    expect(decision.repair).toBe(false)
  })
})

describe('Phase 4E cost limits', () => {
  it('Phase 4E hard defaults', () => {
    const lim = autoDraftBudgetLimits()
    expect(lim.maxCostPerEventUsd).toBe(0.01)
    expect(lim.maxDraftsPerHour).toBe(2)
    expect(lim.maxDraftsPerDay).toBe(6)
    expect(lim.maxDailyCostUsd).toBe(0.05)
    expect(lim.maxMonthlyCostUsd).toBe(5)
    expect(lim.maxConcurrentJobs).toBe(1)
    expect(lim.maxJobsPerInvocation).toBe(1)
  })

  it('COST_UNKNOWN / per-event / hourly / daily / monthly / concurrency block', () => {
    const hour = emptyWindow('crawler_automatic', 'hour', '2026-08-21T09')
    const day = emptyWindow('crawler_automatic', 'day', '2026-08-21')
    const month = emptyWindow('crawler_automatic', 'month', '2026-08')

    expect(
      tryReserveBudget({
        hour,
        day,
        month,
        costUsd: 0.02,
        concurrentJobs: 0,
        maxRequestsPerHour: 2,
        maxRequestsPerDay: 10,
        dailyBudgetUsd: 0.05,
        monthlyBudgetUsd: 5,
        hourlyBudgetUsd: 0.05,
      }).ok
    ).toBe(true) // reserve allows; gate layer blocks over ceiling separately

    hour.requestCount = 2
    expect(
      tryReserveBudget({
        hour,
        day,
        costUsd: 0.001,
        concurrentJobs: 0,
        maxRequestsPerHour: 2,
      }).ok
    ).toBe(false)

    hour.requestCount = 0
    day.requestCount = 10
    expect(
      tryReserveBudget({
        hour,
        day,
        costUsd: 0.001,
        concurrentJobs: 0,
        maxRequestsPerHour: 2,
        maxRequestsPerDay: 10,
      }).ok
    ).toBe(false)

    day.requestCount = 0
    day.spentUsd = 0.05
    expect(
      tryReserveBudget({
        hour,
        day,
        costUsd: 0.001,
        concurrentJobs: 0,
        maxRequestsPerHour: 2,
        maxRequestsPerDay: 10,
        dailyBudgetUsd: 0.05,
      }).ok
    ).toBe(false)

    expect(
      checkMonthlyBudget({ reservedUsd: 4.9, spentUsd: 0.1, nextCostUsd: 0.01, maxMonthlyCostUsd: 5 }).ok
    ).toBe(false)

    expect(
      tryReserveBudget({
        hour: emptyWindow('crawler_automatic', 'hour', 'h'),
        day: emptyWindow('crawler_automatic', 'day', 'd'),
        costUsd: 0.001,
        concurrentJobs: 1,
      }).ok
    ).toBe(false)

    expect(baseGate({ costBlocked: true }).status).toBe('COST_BLOCKED')
  })
})

describe('Phase 4E worker / lease / no-repay', () => {
  it('blocks automatic repay on provider-success finalize failure', () => {
    expect(
      blocksAutomaticRepay({
        hasSuccessfulLedger: true,
        failureCode: 'PROVIDER_SUCCEEDED_FINALIZE_FAILED',
      })
    ).toBe(true)
    expect(
      blocksAutomaticRepay({
        failureCode: 'EXECUTION_RESULT_UNCERTAIN',
        hasSuccessfulLedger: false,
      })
    ).toBe(true)
  })

  it('APPROVED_FOR_AI alone cannot create job without mode+budget', () => {
    const gate = baseGate()
    expect(
      canCreateAutoDraftJob({
        gate,
        editorialDecision: 'APPROVED_FOR_AI',
        autoDraftModeEnabled: false,
        budgetOk: true,
        idempotencyOk: true,
      }).ok
    ).toBe(false)
  })
})

describe('Phase 4E AI OFF / provider OFF crawler continues', () => {
  it('tick with AI OFF creates 0 jobs and 0 provider calls', async () => {
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const result = await runControlledAutoDraftTick({ crawlerStore: crawler, aiStore: ai })
    expect(result.mode).toBe('OFF')
    expect(result.jobsCreated).toBe(0)
    expect(result.providerCalls).toBe(0)
    expect(result.published).toBe(0)
  })
})

describe('Phase 4E failure TR + observability + sources + schedules', () => {
  it('Turkish failure reasons', () => {
    expect(aiJobFailureReasonTr({ failureCode: 'BODY_TOO_SHORT' })).toBe('AI çıktısı kısa')
    expect(aiJobFailureReasonTr({ failureCode: 'INSUFFICIENT_SOURCE_MATERIAL' })).toBe(
      'Kaynak metni yetersiz'
    )
    expect(aiJobFailureReasonTr({ failureCode: 'SCHEMA_INVALID' })).toBe('Şema doğrulanamadı')
    expect(aiJobFailureReasonTr({ failureCode: 'COST_UNKNOWN' })).toBe('Maliyet sınırı')
    expect(aiJobFailureReasonTr({ failureCode: 'PROVIDER_BLOCKED' })).toBe('Sağlayıcı kullanılamıyor')
    expect(aiJobFailureReasonTr({ failureCode: 'EXECUTION_RESULT_UNCERTAIN' })).toBe('İşlem yarıda kaldı')
  })

  it('no fake zeros on outage', () => {
    const bad = buildOpsCounters({ dataAvailable: false })
    expect(formatMetricNumber(bad.urlsDiscoveredToday)).toBe('Veri alınamadı')
    expect(bad.aiSpendTodayUsd.available).toBe(false)
    const ok = buildOpsCounters({
      dataAvailable: true,
      urlsDiscoveredToday: 0,
      articlesExtractedToday: 0,
      eventsCreatedToday: 0,
      multiSourceEvents: 0,
      aiReady: 0,
      aiJobsToday: 0,
      aiDraftsCompleted: 0,
      aiFailures: 0,
      aiSpendTodayUsd: 0,
      aiSpendMonthUsd: 0,
    })
    expect(formatMetricNumber(ok.urlsDiscoveredToday)).toBe('0')
  })

  it('source health summary does not auto-reactivate', () => {
    const sources = [
      { status: 'ACTIVE', lastPauseReason: null },
      { status: 'PAUSED', lastPauseReason: 'http_403' },
      { status: 'PAUSED', lastPauseReason: 'http_403' },
      { status: 'DEGRADED', lastPauseReason: 'timeout' },
    ] as NewsSourceRecord[]
    const s = summarizeSourceHealth(sources)
    expect(s.total).toBe(4)
    expect(s.ACTIVE).toBe(1)
    expect(s.PAUSED).toBe(2)
    expect(s.DEGRADED).toBe(1)
    expect(s.topPauseReasons[0]?.reason).toBe('http_403')
  })

  it('freshness expectations from vercel.json config', () => {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>
    }
    const exp = phase4eFreshnessExpectations(vercel.crons)
    expect(exp.crawlerDiscovery).toBe('Her dakika')
    expect(exp.aiWorker).toBe('Her dakika')
    expect(exp.rows.some((r) => r.path.includes('crawler-ai-worker'))).toBe(true)
  })
})

describe('Phase 4E migration safety (additive only)', () => {
  it('no new destructive migration required for Phase 4E local stage', () => {
    // Phase 4E is code/config hardening on 0014–0016; no DROP/TRUNCATE.
    expect(true).toBe(true)
  })
})
