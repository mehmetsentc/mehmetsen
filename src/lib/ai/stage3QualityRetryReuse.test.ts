import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryResult } from '@/services/newsroom/editors/stage3_categoryEditor'
import { MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'
import { buildAiUsageEventForTest } from '@/lib/ai/usage/telemetry'
import {
  classifyRepeatedStage1Inputs,
  measureStage1RetryOptimizationCanary,
  measureStage3CompactCanary,
  measureStage1CostAnalysis,
  measureStage3QualityRetryReuse,
  measureUnchangedQualityRetrySuppression,
} from '@/lib/ai/usage/pipelineCostSignals'
import { isSkipRedundantClassifierEnabled } from '@/lib/ai/router/flags'
import {
  isOptimizedStage1RetryCohort,
  shouldRunQualityRetry,
} from '@/lib/ai/stage1RetryOptimization'
import { shouldApplyUnchangedQualityRetrySuppression } from '@/lib/ai/unchangedQualityRetry'

const recordAiRequestUsage = vi.fn()

vi.mock('@/lib/ai/usage/telemetry', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/usage/telemetry')>(
    '@/lib/ai/usage/telemetry'
  )
  return {
    ...actual,
    recordAiRequestUsage: (...args: unknown[]) => recordAiRequestUsage(...args),
  }
})

const writeArticle = vi.fn()
const classifyArticle = vi.fn()

vi.mock('@/services/newsroom/editors/stage1_contentWriter', () => ({
  writeArticle: (...args: unknown[]) => writeArticle(...args),
}))

vi.mock('@/services/newsroom/editors/stage3_categoryEditor', () => ({
  classifyArticle: (...args: unknown[]) => classifyArticle(...args),
}))

import { runMultiStageEditor } from '@/services/newsroom/editors/multiStageEditor'
import {
  STAGE3_REUSED_OPERATION,
  cloneStage3Classification,
  isBilledStage3CategoryEvent,
  isReusableStage3Classification,
  rememberReusableStage3,
  shouldReuseStage3OnQualityRetry,
} from '@/lib/ai/stage3QualityRetryReuse'

function words(n: number, word = 'haber'): string {
  return Array.from({ length: n }, () => word).join(' ')
}

const deepseekCategory: CategoryResult = {
  categoryId: 'siyaset',
  isBreaking: false,
  confidence: 82,
  city: 'Ankara',
  district: null,
  country: 'Türkiye',
  tags: ['meclis'],
  reason: 'meclis haberi',
  source: 'deepseek',
}

const heuristicCategory: CategoryResult = {
  ...deepseekCategory,
  categoryId: 'gundem',
  confidence: 50,
  reason: 'heuristik fallback (AI başarısız)',
  source: 'heuristic',
}

const editorInput = {
  sourceLabel: 'AA',
  originalTitle: 'Meclis yasa kabul etti',
  originalSummary: 'Özet.',
  originalContent: words(80, 'kaynak'),
  sourceUrl: 'https://example.test/haber-1',
}

function writtenArticle(title = 'Meclis yasa kabul etti') {
  return {
    title,
    spot: 'Meclis yeni yasayı kabul etti ve yürürlük takvimini açıkladı.',
    summary: 'Meclis yeni yasayı kabul etti.',
    content: `${title}. ${words(MIN_NEWS_BODY_WORDS, 'meclis')} biter.`,
    seoTitle: title,
    seoDescription: 'Meclis yasası',
    aiWritten: true,
  }
}

describe('Stage3 quality-retry reuse helpers', () => {
  it('reuses only DeepSeek success on quality_retry', () => {
    expect(isReusableStage3Classification(deepseekCategory)).toBe(true)
    expect(isReusableStage3Classification(heuristicCategory)).toBe(false)
    expect(isReusableStage3Classification({ ...deepseekCategory, source: undefined })).toBe(false)
    expect(
      shouldReuseStage3OnQualityRetry({
        generationReason: 'quality_retry',
        previousStage3: deepseekCategory,
      })
    ).toBe(true)
    expect(
      shouldReuseStage3OnQualityRetry({
        generationReason: 'initial',
        previousStage3: deepseekCategory,
      })
    ).toBe(false)
    expect(
      shouldReuseStage3OnQualityRetry({
        generationReason: 'quality_retry',
        previousStage3: heuristicCategory,
      })
    ).toBe(false)
  })

  it('clones so gateKeep mutation cannot poison the cache', () => {
    const clone = cloneStage3Classification(deepseekCategory)
    clone.categoryId = 'gundem'
    clone.isBreaking = true
    clone.tags.push('mutated')
    expect(deepseekCategory.categoryId).toBe('siyaset')
    expect(deepseekCategory.isBreaking).toBe(false)
    expect(deepseekCategory.tags).toEqual(['meclis'])
  })

  it('remembers the first DeepSeek success only', () => {
    const first = rememberReusableStage3(deepseekCategory)
    const later = rememberReusableStage3(
      { ...deepseekCategory, categoryId: 'ekonomi' },
      first
    )
    expect(later?.categoryId).toBe('siyaset')
    expect(rememberReusableStage3(heuristicCategory)).toBeUndefined()
    expect(rememberReusableStage3(deepseekCategory, undefined)?.source).toBe('deepseek')
  })

  it('treats stage3_reused as not billed', () => {
    expect(
      isBilledStage3CategoryEvent({ agentName: 'stage3_category', operation: 'classify_category' })
    ).toBe(true)
    expect(
      isBilledStage3CategoryEvent({
        agentName: 'stage3_category',
        operation: STAGE3_REUSED_OPERATION,
      })
    ).toBe(false)
  })
})

describe('runMultiStageEditor Stage3 reuse', () => {
  beforeEach(() => {
    recordAiRequestUsage.mockReset()
    writeArticle.mockReset()
    classifyArticle.mockReset()
    writeArticle.mockResolvedValue(writtenArticle())
    classifyArticle.mockResolvedValue({ ...deepseekCategory })
  })

  it('initial → Stage3 = 1 real classifyArticle call', async () => {
    const result = await runMultiStageEditor(editorInput)
    expect(classifyArticle).toHaveBeenCalledTimes(1)
    expect(result.categoryId).toBe('siyaset')
    expect(result.stage3Classification?.source).toBe('deepseek')
    expect(
      recordAiRequestUsage.mock.calls.some(
        (call) => (call[0] as { operation?: string }).operation === STAGE3_REUSED_OPERATION
      )
    ).toBe(false)
  })

  it('initial → quality_retry → Stage3 still 1 real call', async () => {
    const initial = await runMultiStageEditor(editorInput)
    writeArticle.mockResolvedValue(writtenArticle('Meclis yasası ikinci yazım'))
    const retried = await runMultiStageEditor({
      ...editorInput,
      generationReason: 'quality_retry',
      previousDraft: {
        title: initial.title,
        spot: initial.spot,
        content: initial.description,
      },
      previousStage3: initial.stage3Classification,
    })
    expect(classifyArticle).toHaveBeenCalledTimes(1)
    expect(writeArticle).toHaveBeenCalledTimes(2)
    expect(retried.stage3Classification?.categoryId).toBe('siyaset')
    const reuse = recordAiRequestUsage.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((row) => row.operation === STAGE3_REUSED_OPERATION)
    expect(reuse).toMatchObject({
      agentName: 'stage3_category',
      operation: STAGE3_REUSED_OPERATION,
      provider: 'heuristic',
      stage3ReuseReason: 'quality_retry',
      generationReason: 'quality_retry',
      resultCategoryId: 'siyaset',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    })
  })

  it('multiple quality_retry → Stage3 still 1 real call', async () => {
    const initial = await runMultiStageEditor(editorInput)
    for (let i = 0; i < 3; i += 1) {
      await runMultiStageEditor({
        ...editorInput,
        generationReason: 'quality_retry',
        previousStage3: initial.stage3Classification,
      })
    }
    expect(classifyArticle).toHaveBeenCalledTimes(1)
    expect(
      recordAiRequestUsage.mock.calls.filter(
        (call) => (call[0] as { operation?: string }).operation === STAGE3_REUSED_OPERATION
      )
    ).toHaveLength(3)
  })

  it('Stage3 initial heuristic failure is not reused; QR calls classifyArticle', async () => {
    classifyArticle.mockResolvedValueOnce({ ...heuristicCategory })
    const initial = await runMultiStageEditor(editorInput)
    expect(initial.stage3Classification?.source).toBe('heuristic')
    classifyArticle.mockResolvedValueOnce({ ...deepseekCategory })
    const retried = await runMultiStageEditor({
      ...editorInput,
      generationReason: 'quality_retry',
      previousStage3: initial.stage3Classification,
    })
    expect(classifyArticle).toHaveBeenCalledTimes(2)
    expect(retried.stage3Classification?.source).toBe('deepseek')
  })

  it('reuses Stage3 even when Stage1 rewrote the body', async () => {
    const initial = await runMultiStageEditor(editorInput)
    writeArticle.mockResolvedValue(writtenArticle('Tamamen yeni gövde başlığı'))
    await runMultiStageEditor({
      ...editorInput,
      generationReason: 'quality_retry',
      previousStage3: initial.stage3Classification,
    })
    expect(classifyArticle).toHaveBeenCalledTimes(1)
    expect(classifyArticle.mock.calls[0]?.[0]).toMatchObject({ title: 'Meclis yasa kabul etti' })
  })

  it('does not reuse on initial even if previousStage3 is present', async () => {
    await runMultiStageEditor({
      ...editorInput,
      generationReason: 'initial',
      previousStage3: deepseekCategory,
    })
    expect(classifyArticle).toHaveBeenCalledTimes(1)
  })
})

describe('Stage3 reuse telemetry persist', () => {
  it('persists closed stage3ReuseReason and zero tokens, drops article text', () => {
    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage3_category',
      operation: STAGE3_REUSED_OPERATION,
      provider: 'heuristic',
      generationReason: 'quality_retry',
      stage3ReuseReason: 'quality_retry',
      resultCategoryId: 'siyaset',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    })
    expect(doc.stage3ReuseReason).toBe('quality_retry')
    expect(doc.operation).toBe('stage3_reused')
    expect(doc.provider).toBe('heuristic')
    expect(doc.inputTokens).toBe(0)
    expect(doc.outputTokens).toBe(0)
    expect(doc.totalTokens).toBe(0)
    expect(JSON.stringify(doc)).not.toMatch(/Meclis yasa/)
  })

  it('drops unknown stage3ReuseReason values', () => {
    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage3_category',
      operation: STAGE3_REUSED_OPERATION,
      provider: 'heuristic',
      stage3ReuseReason: 'please_reuse_this_prompt_text',
    })
    expect(doc.stage3ReuseReason).toBeUndefined()
  })
})

describe('Stage3 reuse dashboard KPIs', () => {
  it('counts reused, avoided calls/tokens, and billed calls/news', () => {
    const result = measureStage3QualityRetryReuse([
      {
        agentName: 'stage3_category',
        operation: 'classify_category',
        newsId: 'n1',
        inputTokens: 4000,
        outputTokens: 80,
        totalTokens: 4080,
        success: true,
      },
      {
        agentName: 'stage3_category',
        operation: STAGE3_REUSED_OPERATION,
        stage3ReuseReason: 'quality_retry',
        newsId: 'n1',
        provider: 'heuristic',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      {
        agentName: 'stage3_category',
        operation: 'classify_category',
        newsId: 'n2',
        inputTokens: 3900,
        outputTokens: 70,
        totalTokens: 3970,
        success: true,
      },
    ])
    expect(result.reused).toBe(1)
    expect(result.avoidedStage3Calls).toBe(1)
    expect(result.billedStage3Calls).toBe(2)
    expect(result.newsCount).toBe(2)
    expect(result.stage3CallsPerNews).toBe(1)
    expect(result.estimatedAvoidedStage3Tokens).toBe(Math.round((4080 + 3970) / 2))
  })

  it('does not count reuse as extra Stage3 on quality-retry news', () => {
    const result = measureStage1CostAnalysis([
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        generationReason: 'initial',
        newsId: 'n0',
        inputTokens: 100,
        outputTokens: 20,
        success: true,
      },
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        generationReason: 'quality_retry',
        newsId: 'n0',
        inputTokens: 100,
        outputTokens: 20,
        success: true,
      },
      {
        agentName: 'stage3_category',
        operation: 'classify_category',
        newsId: 'n0',
        success: true,
      },
      {
        agentName: 'stage3_category',
        operation: STAGE3_REUSED_OPERATION,
        stage3ReuseReason: 'quality_retry',
        newsId: 'n0',
        success: true,
      },
    ])
    expect(result.qualityRetryDownstream.extraStage3Calls).toBe(0)
  })

  it('excludes reused events from compact canary request counts', () => {
    const result = measureStage3CompactCanary([
      {
        agentName: 'stage3_category',
        operation: 'classify_category',
        promptVariant: 'control',
        newsId: 'n1',
        resultCategoryId: 'siyaset',
        inputTokens: 4500,
        success: true,
      },
      {
        agentName: 'stage3_category',
        operation: STAGE3_REUSED_OPERATION,
        stage3ReuseReason: 'quality_retry',
        promptVariant: 'control',
        newsId: 'n1',
        inputTokens: 9999,
        success: true,
      },
    ])
    expect(result.control.requests).toBe(1)
    expect(result.control.avgInputTokens).toBe(4500)
  })

  it('does not inflate Phase 2F Stage3 calls/news with reuse events', () => {
    const result = measureStage1RetryOptimizationCanary([
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
        agentName: 'stage4_gate',
        promptVariant: 'control',
        newsId: 'c1',
        gateDecision: 'publish',
        publishScore: 80,
        categoryConfidence: 70,
      },
      { agentName: 'stage3_category', operation: 'classify_category', newsId: 'c1' },
      {
        agentName: 'stage3_category',
        operation: STAGE3_REUSED_OPERATION,
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
        gateDecision: 'publish',
        publishScore: 80,
        categoryConfidence: 70,
      },
      { agentName: 'stage3_category', operation: 'classify_category', newsId: 'o1' },
    ])
    expect(result.control.stage3CallsPerNews).toBe(1)
    expect(result.optimized.stage3CallsPerNews).toBe(1)
  })
})

describe('Phase 2F / 2G / classifier / recategorize untouched', () => {
  it('does not enable classifier skip', () => {
    expect(isSkipRedundantClassifierEnabled()).toBe(false)
  })

  it('Phase 2F quality-retry decision is unchanged', () => {
    expect(
      shouldRunQualityRetry(
        {
          gateDecision: 'draft',
          publishScore: 40,
          categoryConfidence: 80,
          title: 'Tam başlık',
          spot: 'Spot biter.',
          summary: 'Özet biter.',
          description: words(MIN_NEWS_BODY_WORDS),
          aiWritten: true,
        },
        false
      )
    ).toBe(true)
    expect(typeof isOptimizedStage1RetryCohort()).toBe('boolean')
  })

  it('Phase 2G suppression remains independently enabled by default', () => {
    expect(shouldApplyUnchangedQualityRetrySuppression()).toBe(true)
    expect(
      measureUnchangedQualityRetrySuppression([
        {
          agentName: 'stage1_writer',
          operation: 'quality_retry_suppressed',
          retrySuppressedReason: 'unchanged_quality_retry',
        },
      ]).events
    ).toBe(1)
  })

  it('pipeline still runs classifier, FactChecker, and Chief Editor after the QR loop', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'src/services/newsroom/pipeline.ts'),
      'utf8'
    )
    const qr = src.indexOf("generationReason: 'quality_retry'")
    const fact = src.indexOf('factChecker.check')
    const classifier = src.indexOf('const aiCheck = await classifyArticleCategory')
    const chief = src.indexOf('chiefEditorResult = await runChiefEditor')
    expect(qr).toBeGreaterThan(0)
    expect(fact).toBeGreaterThan(qr)
    expect(classifier).toBeGreaterThan(qr)
    expect(chief).toBeGreaterThan(qr)
    expect(src).toContain('previousStage3: reusableStage3')
    expect(src).toContain('shouldApplyUnchangedQualityRetrySuppression')
    expect(src).toContain('isOptimizedStage1RetryCohort')
  })

  it('manual recategorize does not import Stage3 quality-retry reuse', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'src/app/api/admin/recategorize/route.ts'),
      'utf8'
    )
    expect(src).not.toContain('stage3QualityRetryReuse')
    expect(src).not.toContain('previousStage3')
    expect(src).toContain('classifyWithGpt')
  })

  it('unchanged quality-retry class still attributes Stage1 repeats', () => {
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
  })
})
