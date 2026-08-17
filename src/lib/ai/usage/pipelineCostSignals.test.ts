import { describe, expect, it } from 'vitest'
import { classifySecondStage1Call } from '@/lib/ai/usage/generationReason'
import {
  countDuplicateStage1Calls,
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
