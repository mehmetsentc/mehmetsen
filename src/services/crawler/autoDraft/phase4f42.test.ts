/**
 * Phase 4F.4.2 — shadow quality optimization + source recovery (local, $0 paid AI).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluatePrespendGate } from './preSpendGate'
import { classifyEconomicTier } from './economicTiers'
import {
  aggregateUniqueEconomicMetrics,
  compareRawVsUniqueEconomics,
  PRESPEND_GATE_VERSION_4F42,
} from './shadowUniqueEconomics'
import { buildShadowDecision } from './shadowEconomics'
import {
  classifyEditorialContentClass,
  evaluateLowEditorialValue,
} from './lowEditorialValue'
import { getDraftBodyWordCount, formatDraftBodyWordCount } from './draftBodyWords'
import { runControlledAutoDraftTick } from './pipeline'
import { evaluateAutoDraftGate } from './eligibility'
import { MemoryAiDispatchStore } from '../aiDispatch/store'
import { MemoryCrawlerStore } from '../store/memory'

const RICH =
  'Manisa merkezde makilik alanda yangın çıktı. Ekipler havadan ve karadan müdahale ediyor. '.repeat(40)

function gateReady() {
  return evaluateAutoDraftGate({
    clusterAiEligibility: 'ELIGIBLE',
    editorialDecision: 'NONE',
    publishedNewsId: null,
    hasActiveAiJob: false,
    hasCompletedDraft: false,
    hasMaterialUpdate: false,
    updateReviewStatus: null,
    bestWordCount: 450,
    independentSourceCount: 2,
    uniqueSourceCount: 2,
    staleHours: 2,
    exactDuplicateOnly: false,
    avgHealth: 85,
    bestConfidence: 0.9,
    hasLocalGeography: true,
    importanceScore: 70,
    costBlocked: false,
    contentFingerprintChanged: false,
  })
}

afterEach(() => vi.unstubAllEnvs())

describe('Phase 4F.4.2 LOW_EDITORIAL_VALUE gate', () => {
  it('blocks astrology horoscope titles', () => {
    const prespend = evaluatePrespendGate({
      gate: gateReady(),
      bestWordCount: 400,
      bestConfidence: 0.9,
      avgHealth: 80,
      staleHours: 1,
      independentSourceCount: 1,
      usableSourceWords: 350,
      richness: 'rich',
      boilerplateRatio: 0.1,
      malformedExtraction: false,
      costUnknown: false,
      budgetBlocked: false,
      historicalBlocked: false,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      exactDuplicateOnly: false,
      canonicalTitle: 'Yay burcu günlük burç yorumu — 22 Ağustos',
      bodySnippet: 'Yay burcu bugün aşk hayatında şanslı...',
      importanceScore: 35,
    })
    expect(prespend.outcome).toBe('LOW_EDITORIAL_VALUE')
    expect(prespend.labelTr).toBe('Düşük editoryal değer')
    expect(prespend.rejected).toBe(true)
  })

  it('retains hard news and local public interest', () => {
    const hard = evaluatePrespendGate({
      gate: gateReady(),
      bestWordCount: 400,
      bestConfidence: 0.9,
      avgHealth: 80,
      staleHours: 1,
      independentSourceCount: 2,
      usableSourceWords: 350,
      richness: 'rich',
      boilerplateRatio: 0.1,
      malformedExtraction: false,
      costUnknown: false,
      budgetBlocked: false,
      historicalBlocked: false,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      exactDuplicateOnly: false,
      canonicalTitle: 'Manisa’da orman yangını: ekipler müdahale ediyor',
      bodySnippet: RICH,
      city: 'Manisa',
      importanceScore: 72,
      editorialPriority: 'BREAKING',
    })
    expect(hard.outcome).toBe('PRESPEND_READY')

    const local = evaluatePrespendGate({
      gate: gateReady(),
      bestWordCount: 400,
      bestConfidence: 0.9,
      avgHealth: 80,
      staleHours: 1,
      independentSourceCount: 2,
      usableSourceWords: 350,
      richness: 'rich',
      boilerplateRatio: 0.1,
      malformedExtraction: false,
      costUnknown: false,
      budgetBlocked: false,
      historicalBlocked: false,
      hasActiveAiJob: false,
      hasCompletedDraft: false,
      exactDuplicateOnly: false,
      canonicalTitle: 'Çanakkale’de trafik düzenlemesi yapıldı',
      bodySnippet: RICH,
      city: 'Çanakkale',
      importanceScore: 65,
      editorialPriority: 'NORMAL',
    })
    expect(local.outcome).toBe('PRESPEND_READY')
  })

  it('shadow WOULD_BLOCK for low editorial value', () => {
    const editorial = evaluateLowEditorialValue({
      title: 'Koç burcu haftalık yorum',
      importanceScore: 30,
    })
    expect(editorial.lowEditorialValue).toBe(true)
    const shadow = buildShadowDecision({
      clusterId: 'cl_test',
      eventKey: 'ek',
      canonicalTitle: 'Koç burcu haftalık yorum',
      machineEligibility: 'AUTO_DRAFT_ELIGIBLE',
      prespendOutcome: 'LOW_EDITORIAL_VALUE',
      readyToSpend: false,
      tier: 'D',
      shadowDispatchAllowed: false,
      blockReason: 'LOW_EDITORIAL_VALUE',
      estimatedInputTokens: 800,
      estimatedOutputTokens: 200,
      estimatedCostUsd: 0.004,
      costKnown: true,
      rankScore: 50,
      independentSourceCount: 1,
      usableSourceWords: 200,
      editorialDecisionSnapshot: 'NONE',
      contentFingerprint: 'fp1',
      prespendGateVersion: PRESPEND_GATE_VERSION_4F42,
    })
    expect(shadow.action).toBe('WOULD_BLOCK')
  })
})

describe('Phase 4F.4.2 editorial class audit', () => {
  it('classifies breaking and astrology deterministically', () => {
    expect(
      classifyEditorialContentClass({
        title: 'Son dakika: İstanbul’da deprem',
        editorialPriority: 'BREAKING',
      })
    ).toBe('BREAKING_NEWS')
    expect(
      classifyEditorialContentClass({ title: 'Balık burcu günlük burç yorumu' })
    ).toBe('ASTROLOGY')
  })
})

describe('Phase 4F.4.2 economic tier + importance', () => {
  it('Tier A requires multi-source rich path unchanged', () => {
    const a = classifyEconomicTier({
      richness: 'rich',
      independentSourceCount: 2,
      usableSourceWords: 450,
      bestConfidence: 0.85,
      avgHealth: 80,
      importanceScore: 70,
      prespendOutcome: 'PRESPEND_READY',
    })
    expect(a.tier).toBe('A')
  })

  it('LOW_EDITORIAL_VALUE maps to tier D hard reject', () => {
    const d = classifyEconomicTier({
      richness: 'rich',
      independentSourceCount: 2,
      usableSourceWords: 450,
      bestConfidence: 0.85,
      avgHealth: 80,
      importanceScore: 70,
      prespendOutcome: 'LOW_EDITORIAL_VALUE',
    })
    expect(d.tier).toBe('D')
    expect(d.shadowDispatchAllowed).toBe(false)
  })
})

describe('Phase 4F.4.2 body word helper', () => {
  it('reads quality.bodyWords from 4F.4.1 acceptance draft shape', () => {
    const snapshot = {
      title: 'Test',
      body: 'word '.repeat(120).trim(),
      quality: { bodyWords: 118, code: 'OK', labelTr: 'Uygun', reasonsTr: [] },
    }
    expect(getDraftBodyWordCount(snapshot)).toBe(118)
  })

  it('falls back to body text and never fakes zero', () => {
    expect(getDraftBodyWordCount({ body: 'a b c d e' })).toBe(5)
    expect(getDraftBodyWordCount({ body: '' })).toBeNull()
    expect(getDraftBodyWordCount(null)).toBeNull()
    expect(formatDraftBodyWordCount({ body: 'a b c' })).toBe('3')
    expect(formatDraftBodyWordCount(null)).toBe('Veri alınamadı')
  })
})

describe('Phase 4F.4.2 unique economics', () => {
  it('does not double-count repeated evaluations', () => {
    const rows = [
      {
        clusterId: 'cl1',
        contentFingerprint: 'fp',
        prespendGateVersion: PRESPEND_GATE_VERSION_4F42,
        action: 'WOULD_DISPATCH',
        blockReason: null,
        economicTier: 'B',
        estimatedCostUsd: 0.004,
        costKnown: true,
        prespendOutcome: 'PRESPEND_READY',
      },
      {
        clusterId: 'cl1',
        contentFingerprint: 'fp',
        prespendGateVersion: PRESPEND_GATE_VERSION_4F42,
        action: 'WOULD_DISPATCH',
        blockReason: null,
        economicTier: 'B',
        estimatedCostUsd: 0.004,
        costKnown: true,
        prespendOutcome: 'PRESPEND_READY',
      },
    ]
    const { oldRepeatedEstimate, newUniqueEstimate } = compareRawVsUniqueEconomics(rows)
    expect(oldRepeatedEstimate.uniqueWouldDispatch).toBe(2)
    expect(newUniqueEstimate.uniqueWouldDispatch).toBe(1)
  })

  it('counts LOW_EDITORIAL_VALUE in unique block reasons', () => {
    const m = aggregateUniqueEconomicMetrics([
      {
        clusterId: 'cl2',
        contentFingerprint: 'fp2',
        prespendGateVersion: PRESPEND_GATE_VERSION_4F42,
        action: 'WOULD_BLOCK',
        blockReason: 'LOW_EDITORIAL_VALUE',
        economicTier: 'D',
        estimatedCostUsd: 0.004,
        costKnown: true,
        prespendOutcome: 'LOW_EDITORIAL_VALUE',
      },
    ])
    expect(m.uniqueWouldBlock).toBe(1)
    expect(m.byPrespend.LOW_EDITORIAL_VALUE).toBe(1)
  })
})

describe('Phase 4F.4.2 SHADOW no provider', () => {
  it('shadow tick creates zero jobs and zero provider calls', async () => {
    vi.stubEnv('CRAWLER_AI_MODE', 'SHADOW_AUTO_DRAFT')
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'false')
    vi.stubEnv('CRAWLER_AI_PROVIDER_ENABLED', 'false')
    vi.stubEnv('DEEPSEEK_INPUT_COST_PER_1M', '0.44')
    vi.stubEnv('DEEPSEEK_OUTPUT_COST_PER_1M', '1.32')
    const crawler = new MemoryCrawlerStore()
    const ai = new MemoryAiDispatchStore()
    const tick = await runControlledAutoDraftTick({
      crawlerStore: crawler,
      aiStore: ai,
      now: new Date(),
      limit: 3,
    })
    expect(tick.jobsCreated).toBe(0)
    expect(tick.providerCalls).toBe(0)
    expect(tick.mode).toBe('SHADOW_AUTO_DRAFT')
  })
})
