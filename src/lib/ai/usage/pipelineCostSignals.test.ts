import { describe, expect, it } from 'vitest'
import { classifySecondStage1Call } from '@/lib/ai/usage/generationReason'
import {
  classifyRepeatedStage1Inputs,
  countDuplicateStage1Calls,
  measureStage1CostAnalysis,
  measureStage1RetryOptimizationCanary,
  measureStage3ClassifierOverlap,
  measureStage3CompactCanary,
} from '@/lib/ai/usage/pipelineCostSignals'

describe('Stage1 retry reason attribution', () => {
  it('classifies same-hash attempt 2 as provider retry', () => {
    expect(
      classifySecondStage1Call({ sameInputHash: true, attempt: 2, generationReason: 'provider_retry' })
    ).toBe('C')
  })

  it('classifies continuation and quality retry', () => {
    expect(classifySecondStage1Call({ sameInputHash: false, attempt: 1, generationReason: 'continuation' })).toBe(
      'A'
    )
    expect(classifySecondStage1Call({ sameInputHash: false, attempt: 1, generationReason: 'quality_retry' })).toBe(
      'B'
    )
  })
})

describe('same inputHash detection', () => {
  it('counts extra generate_article calls with the same hash', () => {
    const result = countDuplicateStage1Calls([
      { agentName: 'stage1_writer', operation: 'generate_article', inputHash: 'aaa' },
      { agentName: 'stage1_writer', operation: 'generate_article', inputHash: 'aaa' },
      { agentName: 'stage1_writer', operation: 'generate_article', inputHash: 'bbb' },
    ])
    expect(result).toEqual({ groups: 1, extraCalls: 1 })
  })

  it('classifies quality-retry repeats separately from cross-queue duplicates', () => {
    const classified = classifyRepeatedStage1Inputs([
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        inputHash: 'aaa',
        generationReason: 'quality_retry',
        traceId: 't1',
        queueId: 'q1',
        createdAt: 1,
      },
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        inputHash: 'aaa',
        generationReason: 'quality_retry',
        traceId: 't1',
        queueId: 'q1',
        createdAt: 2,
      },
    ])
    expect(classified.byClass.unchanged_quality_retry.groups).toBe(1)
    expect(classified.byClass.cross_queue_duplicate.groups).toBe(0)
  })
})

describe('Stage3/classifier overlap', () => {
  it('measures both / only / agreement', () => {
    const result = measureStage3ClassifierOverlap([
      { agentName: 'stage3_category', newsId: 'n1', resultCategoryId: 'gundem' },
      { agentName: 'category_classifier', newsId: 'n1', resultCategoryId: 'gundem' },
      { agentName: 'stage3_category', newsId: 'n2', resultCategoryId: 'siyaset' },
      { agentName: 'category_classifier', newsId: 'n3', resultCategoryId: 'spor' },
    ])
    expect(result.both).toBe(1)
    expect(result.stage3Only).toBe(1)
    expect(result.classifierOnly).toBe(1)
    expect(result.agreementRate).toBe(1)
  })
})

describe('Stage3 compact canary aggregates', () => {
  it('compares control vs compact tokens and classifier agreement', () => {
    const result = measureStage3CompactCanary([
      {
        agentName: 'stage3_category',
        promptVariant: 'control',
        newsId: 'n1',
        resultCategoryId: 'siyaset',
        inputTokens: 4500,
        outputTokens: 80,
        latencyMs: 900,
        success: true,
      },
      {
        agentName: 'category_classifier',
        newsId: 'n1',
        resultCategoryId: 'siyaset',
        success: true,
      },
      {
        agentName: 'stage3_category',
        promptVariant: 'compact',
        newsId: 'n2',
        resultCategoryId: 'gundem',
        inputTokens: 1200,
        outputTokens: 70,
        latencyMs: 400,
        success: true,
      },
      {
        agentName: 'category_classifier',
        newsId: 'n2',
        resultCategoryId: 'siyaset',
        success: true,
      },
    ])
    expect(result.control.requests).toBe(1)
    expect(result.compact.requests).toBe(1)
    expect(result.tokenSaving.reductionPct).toBeCloseTo((4500 - 1200) / 4500)
    expect(result.controlQuality.agreementRate).toBe(1)
    expect(result.compactQuality.disagree).toBe(1)
    expect(result.compactQuality.genericRate).toBe(1)
  })
})

describe('Stage1 cost analysis', () => {
  it('computes calls per news and reason rates including 9/19 continuation', () => {
    const events = [
      ...Array.from({ length: 4 }, (_, i) => ({
        agentName: 'stage1_writer',
        operation: 'generate_article',
        generationReason: 'initial',
        newsId: `n${i}`,
        inputTokens: 4000,
        outputTokens: 800,
        latencyMs: 2000,
        promptSystemTokens: 400,
        promptSourceTokens: 3000,
        promptInstructionTokens: 400,
        promptOtherTokens: 200,
        success: true,
      })),
      ...Array.from({ length: 9 }, (_, i) => ({
        agentName: 'stage1_writer',
        operation: 'generate_article',
        generationReason: 'continuation',
        newsId: `n${i % 4}`,
        inputTokens: 4500,
        outputTokens: 900,
        success: true,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        agentName: 'stage1_writer',
        operation: 'generate_article',
        generationReason: 'quality_retry',
        newsId: `n${i % 4}`,
        inputTokens: 4800,
        outputTokens: 850,
        retryTriggers: ['draft', 'publish_score_low'],
        success: true,
      })),
      { agentName: 'stage3_category', newsId: 'n0', inputTokens: 1200, success: true },
      { agentName: 'stage3_category', newsId: 'n0', inputTokens: 1100, success: true },
      { agentName: 'fact_checker', newsId: 'n0', success: true },
      { agentName: 'chief_editor', newsId: 'n0', success: true },
      {
        agentName: 'stage1_writer_shadow',
        operation: 'generate_article_shadow',
        shadowProvider: 'groq',
        provider: 'groq',
        shadowSuccess: true,
        success: true,
        shadowInputTokens: 1400,
        inputTokens: 1400,
        shadowOutputTokens: 700,
        shadowLatencyMs: 400,
      },
    ]
    const result = measureStage1CostAnalysis(events)
    expect(result.stage1Requests).toBe(19)
    expect(result.reasonCounts.continuation).toBe(9)
    expect(result.reasonCounts.quality_retry).toBe(6)
    expect(result.reasonRates.continuation).toBeCloseTo(9 / 19)
    expect(result.reasonRates.quality_retry).toBeCloseTo(6 / 19)
    expect(result.reasonRates.pipeline_retry).toBe(0)
    expect(result.callsPerNews).toBeCloseTo(19 / 4)
    expect(result.maxCallsPerNews).toBeGreaterThanOrEqual(4)
    expect(result.retryTriggers.draft).toBe(6)
    expect(result.retryTriggers.publish_score_low).toBe(6)
    expect(result.extraContinuationTokens).toBe(9 * (4500 + 900))
    expect(result.extraQualityRetryStage1Tokens).toBe(6 * (4800 + 850))
    expect(result.qualityRetryDownstream.extraStage3Calls).toBe(1)
    expect(result.qualityRetryDownstream.extraFactCheckerCalls).toBe(0)
    expect(result.qualityRetryDownstream.extraChiefEditorCalls).toBe(0)
    expect(result.shadow.requests).toBe(1)
    expect(result.shadow.successRate).toBe(1)
    expect(result.promptParts.sourceShare).toBeGreaterThan(0.5)
    expect(result.projectedSavings.p10.tokens).toBeGreaterThan(0)
  })
})

describe('Stage1 retry optimization canary aggregates', () => {
  it('compares control vs optimized without storing article text', () => {
    const events = [
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        promptVariant: 'control',
        generationReason: 'initial',
        newsId: 'c1',
        inputTokens: 4000,
        outputTokens: 800,
      },
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        promptVariant: 'control',
        generationReason: 'continuation',
        newsId: 'c1',
        inputTokens: 4100,
        outputTokens: 900,
        retryTriggers: ['body_too_short'],
      },
      {
        agentName: 'stage4_gate',
        promptVariant: 'control',
        newsId: 'c1',
        gateDecision: 'publish',
        publishScore: 80,
        categoryConfidence: 70,
        outputWordCount: 260,
      },
      {
        agentName: 'stage3_category',
        promptVariant: 'control',
        newsId: 'c1',
      },
      {
        agentName: 'stage3_category',
        promptVariant: 'control',
        newsId: 'c1',
      },
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        promptVariant: 'optimized',
        generationReason: 'initial',
        newsId: 'o1',
        inputTokens: 4000,
        outputTokens: 800,
      },
      {
        agentName: 'stage4_gate',
        promptVariant: 'optimized',
        newsId: 'o1',
        gateDecision: 'draft',
        publishScore: 40,
        categoryConfidence: 70,
        outputWordCount: 140,
        retryTriggers: ['short_body_quality'],
      },
      {
        agentName: 'stage3_category',
        promptVariant: 'compact',
        newsId: 'o1',
      },
    ]
    const result = measureStage1RetryOptimizationCanary(events)
    expect(result.enabled).toBe(true)
    expect(result.control.callsPerNews).toBe(2)
    expect(result.optimized.callsPerNews).toBe(1)
    expect(result.callDropPct).toBeCloseTo(0.5)
    expect(result.optimized.maxCallsPerNews).toBe(1)
    expect(result.control.publishRate).toBe(1)
    expect(result.optimized.draftRate).toBe(1)
    expect(JSON.stringify(result)).not.toMatch(/Belediye/)
  })
})

