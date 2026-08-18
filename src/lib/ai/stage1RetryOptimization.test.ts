import { afterEach, describe, expect, it, vi } from 'vitest'
import { groqCohortBucket } from '@/lib/ai/groqRouting'
import { MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'
import { sanitizeRetryTriggers } from '@/lib/ai/usage/retryTriggers'
import {
  STAGE1_RETRY_OPT_CAP,
  buildPhase2eBaselineTraces,
  createStage1CallBudget,
  getStage1RetryOptimizationPercent,
  isStage1RetryOptimizationEnabled,
  remainingStage1LogicalCalls,
  shouldRunQualityRetry,
  shouldRunStage1Continuation,
  shouldUseStage1RetryOptimization,
  simulateOptimizedStage1Calls,
  summarizeRetryOptimizationSimulation,
  tryConsumeStage1LogicalCall,
} from '@/lib/ai/stage1RetryOptimization'

function words(n: number, word = 'haber'): string {
  return Array.from({ length: n }, () => word).join(' ')
}

const completeShort = {
  title: 'Tam başlık burada',
  spot: 'Lider cümle burada biter.',
  summary: 'Kısa özet burada biter.',
  content: 'Belediye başkanı açıklama yaptı. Çalışmalar devam ediyor.',
}

const completeLong = {
  title: 'Tam başlık burada',
  spot: 'Lider cümle burada biter.',
  summary: 'Kısa özet burada biter.',
  content: `${words(MIN_NEWS_BODY_WORDS)} biter.`,
}

describe('Stage1 retry optimization flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is disabled by default', () => {
    vi.stubEnv('AI_STAGE1_RETRY_OPTIMIZATION_ENABLED', '')
    vi.stubEnv('AI_STAGE1_RETRY_OPTIMIZATION_PERCENT', '')
    expect(isStage1RetryOptimizationEnabled()).toBe(false)
    expect(getStage1RetryOptimizationPercent()).toBe(0)
    expect(shouldUseStage1RetryOptimization('news-1')).toBe(false)
  })

  it('stays off when enabled but percent is 0', () => {
    vi.stubEnv('AI_STAGE1_RETRY_OPTIMIZATION_ENABLED', 'true')
    vi.stubEnv('AI_STAGE1_RETRY_OPTIMIZATION_PERCENT', '0')
    expect(isStage1RetryOptimizationEnabled()).toBe(false)
    expect(shouldUseStage1RetryOptimization('news-1')).toBe(false)
  })

  it('uses a deterministic SHA-256 cohort without Math.random', () => {
    vi.stubEnv('AI_STAGE1_RETRY_OPTIMIZATION_ENABLED', 'true')
    vi.stubEnv('AI_STAGE1_RETRY_OPTIMIZATION_PERCENT', '10')
    expect(groqCohortBucket('news-abc')).toBe(groqCohortBucket('news-abc'))
    expect(shouldUseStage1RetryOptimization('news-abc')).toBe(groqCohortBucket('news-abc') < 10)
  })
})

describe('logical Stage1 cap', () => {
  it('allows initial + one corrective and blocks a third', () => {
    const budget = createStage1CallBudget(STAGE1_RETRY_OPT_CAP)
    expect(tryConsumeStage1LogicalCall(budget)).toBe(true)
    expect(tryConsumeStage1LogicalCall(budget)).toBe(true)
    expect(tryConsumeStage1LogicalCall(budget)).toBe(false)
    expect(remainingStage1LogicalCalls(budget)).toBe(0)
    expect(budget.used).toBe(2)
  })

  it('does not treat provider HTTP retry as a second logical call', () => {
    const budget = createStage1CallBudget(STAGE1_RETRY_OPT_CAP)
    expect(tryConsumeStage1LogicalCall(budget)).toBe(true)
    expect(remainingStage1LogicalCalls(budget)).toBe(1)
  })
})

describe('optimized continuation policy', () => {
  it('does not continue for a short but complete article', () => {
    expect(shouldRunStage1Continuation(completeShort, true)).toBe(false)
    expect(shouldRunStage1Continuation(completeShort, false)).toBe(true)
  })

  it('keeps continuation for incomplete segment, truncation, title, and schema failure', () => {
    expect(
      shouldRunStage1Continuation(
        {
          ...completeLong,
          content: `${words(MIN_NEWS_BODY_WORDS)} biter.\n\nBu paragraf yarım kaldı çünkü bağlaçla bitiyor ve`,
        },
        true
      )
    ).toBe(true)
    expect(
      shouldRunStage1Continuation({ ...completeLong, content: `${words(MIN_NEWS_BODY_WORDS)} kesilmis` }, true)
    ).toBe(true)
    expect(shouldRunStage1Continuation({ ...completeLong, title: 'Belediye başkanı ve' }, true)).toBe(true)
    expect(shouldRunStage1Continuation({ title: 'Başlık', content: `${words(MIN_NEWS_BODY_WORDS)} biter.` }, true)).toBe(
      true
    )
  })
})

describe('optimized quality retry policy', () => {
  it('does not start a full rewrite for the short_body_quality cluster', () => {
    const input = {
      gateDecision: 'draft' as const,
      gateReasons: ['içerik çok kısa — min gövde kelimesi karşılanmadı'],
      publishScore: 40,
      categoryConfidence: 80,
      ...completeShort,
      description: completeShort.content,
      aiWritten: true,
      shortContent: true,
    }
    expect(shouldRunQualityRetry(input, true)).toBe(false)
    expect(shouldRunQualityRetry(input, false)).toBe(true)
  })

  it('keeps retry for category_confidence_zero and incomplete content', () => {
    expect(
      shouldRunQualityRetry(
        {
          gateDecision: 'publish',
          publishScore: 80,
          categoryConfidence: 0,
          ...completeLong,
          description: completeLong.content,
          aiWritten: false,
        },
        true
      )
    ).toBe(true)
    expect(
      shouldRunQualityRetry(
        {
          gateDecision: 'draft',
          publishScore: 40,
          categoryConfidence: 80,
          title: 'Tam başlık',
          spot: 'Spot biter.',
          summary: 'Özet biter.',
          description: `${words(MIN_NEWS_BODY_WORDS)} biter.\n\nBu paragraf yarım kaldı çünkü bağlaçla bitiyor ve`,
          aiWritten: true,
        },
        true
      )
    ).toBe(true)
  })
})

describe('Phase 2E baseline simulation', () => {
  it('matches 43 news / 154 calls and drops optimized calls ≥40% with max ≤2', () => {
    const traces = buildPhase2eBaselineTraces()
    const summary = summarizeRetryOptimizationSimulation(traces)
    expect(summary.news).toBe(43)
    expect(summary.controlCalls).toBe(154)
    expect(summary.controlCallsPerNews).toBeCloseTo(3.58, 1)
    expect(summary.callDropPct).toBeGreaterThanOrEqual(0.4)
    expect(summary.optimizedCallsPerNews).toBeLessThanOrEqual(2)
    expect(summary.optimizedMax).toBeLessThanOrEqual(2)
    expect(summary.controlMax).toBe(6)
  })

  it('skips short-body continuation and quality retry but keeps incomplete_content', () => {
    const shortOnly = simulateOptimizedStage1Calls([
      { reason: 'initial' },
      { reason: 'continuation', triggers: ['body_too_short'] },
      { reason: 'quality_retry', triggers: ['draft', 'publish_score_low', 'body_short'] },
      { reason: 'continuation', triggers: ['body_too_short'] },
    ])
    expect(shortOnly.optimizedCalls).toBe(1)
    expect(shortOnly.skippedContinuation).toBe(2)
    expect(shortOnly.skippedQualityRetry).toBe(1)

    const incomplete = simulateOptimizedStage1Calls([
      { reason: 'initial' },
      { reason: 'continuation', triggers: ['incomplete_segment'] },
      { reason: 'quality_retry', triggers: ['incomplete_content'] },
    ])
    expect(incomplete.optimizedCalls).toBe(2)
    expect(incomplete.hitCap).toBe(true)
  })

  it('does not persist article text in trigger sanitization', () => {
    expect(sanitizeRetryTriggers(['short_body_quality', 'İçerik: Belediye', 'schema_failure'])).toEqual([
      'short_body_quality',
      'schema_failure',
    ])
  })
})
