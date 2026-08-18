import { afterEach, describe, expect, it, vi } from 'vitest'
import { groqCohortBucket } from '@/lib/ai/groqRouting'
import { MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'
import { shouldRunQualityRetry, shouldRunStage1Continuation } from '@/lib/ai/stage1RetryOptimization'
import { STAGE1_RETRY_OPT_CAP, createStage1CallBudget, tryConsumeStage1LogicalCall } from '@/lib/ai/stage1RetryOptimization'
import { buildAiUsageEventForTest } from '@/lib/ai/usage/telemetry'
import { hashStage1WriterInput } from '@/services/newsroom/editors/stage1_contentWriter'
import {
  classifyRepeatedStage1Inputs,
  measureUnchangedQualityRetrySuppression,
} from '@/lib/ai/usage/pipelineCostSignals'

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

import {
  getUnchangedQualityRetrySuppressionPercent,
  isUnchangedQualityRetrySuppressionEnabled,
  runQualityRewriteLoop,
  shouldApplyUnchangedQualityRetrySuppression,
  shouldSuppressUnchangedQualityRetry,
  unchangedQualityRetryBucket,
} from '@/lib/ai/unchangedQualityRetry'

function words(n: number, word = 'haber'): string {
  return Array.from({ length: n }, () => word).join(' ')
}

const source = {
  sourceLabel: 'AA',
  originalTitle: 'Belediye duyurusu',
  originalSummary: 'Özet metin.',
  originalContent: words(80, 'kaynak'),
  sourceUrl: 'https://example.test/haber-1',
}

const draftA = {
  title: 'Taslak başlık A',
  spot: 'Spot A biter.',
  content: `${words(40, 'taslakA')} biter.`,
}

const draftB = {
  title: 'Taslak başlık B çok farklı',
  spot: 'Spot B tamamen başka cümlelerle biter.',
  content: `${words(40, 'taslakB')} biter.`,
}

const shortDraft = {
  title: 'Kısa haber',
  spot: 'Lider cümle biter.',
  summary: 'Özet biter.',
  description: 'Belediye başkanı açıklama yaptı. Çalışmalar devam ediyor.',
  gateDecision: 'draft' as 'publish' | 'draft' | 'skip',
  gateReasons: ['içerik çok kısa — min gövde kelimesi karşılanmadı'],
  publishScore: 40,
  categoryConfidence: 80,
}

function baseWriter(previousDraft = draftA, hints = ['Gövde çok kısa']) {
  return hashStage1WriterInput({
    ...source,
    generationReason: 'quality_retry',
    revisionHints: hints,
    previousDraft,
  })
}

describe('unchanged quality retry flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to global on without production ENV', () => {
    vi.stubEnv('AI_STAGE1_UNCHANGED_RETRY_SUPPRESSION_ENABLED', '')
    vi.stubEnv('AI_STAGE1_UNCHANGED_RETRY_SUPPRESSION_PERCENT', '')
    expect(isUnchangedQualityRetrySuppressionEnabled()).toBe(true)
    expect(getUnchangedQualityRetrySuppressionPercent()).toBe(100)
    expect(shouldApplyUnchangedQualityRetrySuppression('news-1')).toBe(true)
  })

  it('kill switch disables suppression', () => {
    vi.stubEnv('AI_STAGE1_UNCHANGED_RETRY_SUPPRESSION_ENABLED', 'false')
    expect(shouldApplyUnchangedQualityRetrySuppression('news-1')).toBe(false)
  })

  it('uses a SHA-256 cohort independent of Phase 2F', () => {
    vi.stubEnv('AI_STAGE1_UNCHANGED_RETRY_SUPPRESSION_ENABLED', 'true')
    vi.stubEnv('AI_STAGE1_UNCHANGED_RETRY_SUPPRESSION_PERCENT', '10')
    const key = 'news-abc'
    expect(unchangedQualityRetryBucket(key)).toBe(unchangedQualityRetryBucket(key))
    expect(unchangedQualityRetryBucket(key)).not.toBe(groqCohortBucket(key))
    expect(shouldApplyUnchangedQualityRetrySuppression(key)).toBe(unchangedQualityRetryBucket(key) < 10)
  })
})

describe('Stage1 input hash for quality retry', () => {
  it('matches for identical previousDraft + hints and differs when draft changes', () => {
    const a = baseWriter(draftA)
    const b = baseWriter(draftA)
    const c = baseWriter(draftB)
    expect(a.inputHash).toBeTruthy()
    expect(a.inputHash).toBe(b.inputHash)
    expect(c.inputHash).not.toBe(a.inputHash)
  })

  it('source-once packed quality_retry hashes stay equal for unchanged messages', () => {
    const packed = {
      ...source,
      userPromptOverride: '--- KAYNAK VERİSİ ---\nkaynak gövde\n',
      sourceAlreadyIncluded: true,
      generationReason: 'quality_retry' as const,
      revisionHints: ['Gövde çok kısa'],
      previousDraft: draftA,
    }
    const a = hashStage1WriterInput(packed)
    const b = hashStage1WriterInput(packed)
    expect(a.promptPacking).toBe('source_once')
    expect(a.inputHash).toBe(b.inputHash)
  })
})

describe('quality rewrite loop suppression', () => {
  afterEach(() => {
    recordAiRequestUsage.mockReset()
  })

  const hashA = baseWriter(draftA).inputHash
  const hashB = baseWriter(draftB).inputHash

  it('1. allows the initial generation path (loop starts after initial)', async () => {
    const result = await runQualityRewriteLoop({
      initial: { ...shortDraft, gateDecision: 'publish', publishScore: 80, description: `${words(MIN_NEWS_BODY_WORDS)} biter.` },
      maxAttempts: 2,
      remainingLogicalCalls: () => 10,
      shouldRetry: () => false,
      suppressionEnabled: true,
      hashAttempt: () => ({ attempt: 1, inputHash: hashA }),
      runAttempt: async () => shortDraft,
      selectWinner: (_p, n) => n,
      shouldStop: () => false,
    })
    expect(result.editorCalls).toBe(0)
    expect(result.suppressed).toBe(0)
  })

  it('2–3. first quality retry runs; first continuation policy still fires for incomplete text', async () => {
    expect(
      shouldRunStage1Continuation(
        {
          title: 'Tam başlık',
          spot: 'Spot biter.',
          summary: 'Özet biter.',
          content: `${words(MIN_NEWS_BODY_WORDS)} kesilmis`,
        },
        false
      )
    ).toBe(true)
    const runAttempt = vi.fn(async () => shortDraft)
    const result = await runQualityRewriteLoop({
      initial: shortDraft,
      maxAttempts: 2,
      remainingLogicalCalls: () => 10,
      shouldRetry: () => true,
      suppressionEnabled: true,
      hashAttempt: () => ({ attempt: 1, inputHash: hashA }),
      runAttempt,
      selectWinner: (_p, n) => n,
      shouldStop: () => true,
    })
    expect(runAttempt).toHaveBeenCalledTimes(1)
    expect(result.editorCalls).toBe(1)
    expect(result.suppressed).toBe(0)
  })

  it('4–5. unchanged second quality retry is suppressed with no provider call', async () => {
    const runAttempt = vi.fn(async () => shortDraft)
    const result = await runQualityRewriteLoop({
      initial: shortDraft,
      maxAttempts: 2,
      remainingLogicalCalls: () => 10,
      shouldRetry: () => true,
      suppressionEnabled: true,
      hashAttempt: () => ({
        attempt: 1,
        inputHash: hashA,
        promptSystemTokens: 100,
        promptSourceTokens: 200,
        promptInstructionTokens: 50,
        promptOtherTokens: 10,
        promptTotalTokens: 360,
      }),
      runAttempt,
      selectWinner: (previous) => previous,
      shouldStop: () => false,
    })
    expect(runAttempt).toHaveBeenCalledTimes(1)
    expect(result.editorCalls).toBe(1)
    expect(result.suppressed).toBe(1)
    expect(recordAiRequestUsage).toHaveBeenCalledTimes(1)
    expect(recordAiRequestUsage.mock.calls[0]?.[0]).toMatchObject({
      operation: 'quality_retry_suppressed',
      retrySuppressedReason: 'unchanged_quality_retry',
      generationReason: 'quality_retry',
      inputHash: hashA,
    })
  })

  it('6. changed corrective input may proceed', async () => {
    const runAttempt = vi.fn(async () => ({
      ...shortDraft,
      title: draftB.title,
      description: draftB.content,
    }))
    let n = 0
    const result = await runQualityRewriteLoop({
      initial: shortDraft,
      maxAttempts: 2,
      remainingLogicalCalls: () => 10,
      shouldRetry: () => true,
      suppressionEnabled: true,
      hashAttempt: () => {
        n += 1
        return { attempt: n, inputHash: n === 1 ? hashA : hashB }
      },
      runAttempt,
      selectWinner: (_p, next) => next,
      shouldStop: () => false,
    })
    expect(runAttempt).toHaveBeenCalledTimes(2)
    expect(result.suppressed).toBe(0)
  })

  it('7–8. truncation and incomplete-content still request quality retry', () => {
    expect(
      shouldRunQualityRetry(
        {
          gateDecision: 'draft',
          publishScore: 40,
          categoryConfidence: 80,
          title: 'Tam başlık',
          spot: 'Spot biter.',
          summary: 'Özet biter.',
          description: `${words(MIN_NEWS_BODY_WORDS)} kesilmis`,
          aiWritten: true,
        },
        false
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
        false
      )
    ).toBe(true)
  })

  it('10. manual regeneration is not blocked (new loop, no global hash lock)', async () => {
    const runAttempt = vi.fn(async () => shortDraft)
    const opts = {
      initial: shortDraft,
      maxAttempts: 2,
      remainingLogicalCalls: () => 10,
      shouldRetry: () => true,
      suppressionEnabled: true,
      hashAttempt: () => ({ attempt: 1, inputHash: hashA }),
      runAttempt,
      selectWinner: (previous: typeof shortDraft) => previous,
      shouldStop: () => false,
    }
    await runQualityRewriteLoop(opts)
    await runQualityRewriteLoop(opts)
    expect(runAttempt).toHaveBeenCalledTimes(2)
  })

  it('11. Phase 2F optimized cap still blocks a third logical call', () => {
    const budget = createStage1CallBudget(STAGE1_RETRY_OPT_CAP)
    expect(tryConsumeStage1LogicalCall(budget)).toBe(true)
    expect(tryConsumeStage1LogicalCall(budget)).toBe(true)
    expect(tryConsumeStage1LogicalCall(budget)).toBe(false)
  })

  it('12. control does not enter the 6-call unchanged loop', async () => {
    const runAttempt = vi.fn(async () => shortDraft)
    const result = await runQualityRewriteLoop({
      initial: shortDraft,
      maxAttempts: 2,
      remainingLogicalCalls: () => Number.POSITIVE_INFINITY,
      shouldRetry: () => true,
      suppressionEnabled: true,
      hashAttempt: () => ({ attempt: 1, inputHash: hashA }),
      runAttempt,
      selectWinner: (previous) => previous,
      shouldStop: () => false,
    })
    expect(result.editorCalls).toBe(1)
    expect(result.suppressed).toBe(1)
    expect(result.attempts).toBe(2)
  })

  it('when kill-switched off, a second identical quality retry still runs', async () => {
    const runAttempt = vi.fn(async () => shortDraft)
    const result = await runQualityRewriteLoop({
      initial: shortDraft,
      maxAttempts: 2,
      remainingLogicalCalls: () => 10,
      shouldRetry: () => true,
      suppressionEnabled: false,
      hashAttempt: () => ({ attempt: 1, inputHash: hashA }),
      runAttempt,
      selectWinner: (previous) => previous,
      shouldStop: () => false,
    })
    expect(runAttempt).toHaveBeenCalledTimes(2)
    expect(result.suppressed).toBe(0)
  })

  it('15. does not introduce a retry storm', async () => {
    const runAttempt = vi.fn(async () => shortDraft)
    const result = await runQualityRewriteLoop({
      initial: shortDraft,
      maxAttempts: 50,
      remainingLogicalCalls: () => 50,
      shouldRetry: () => true,
      suppressionEnabled: true,
      hashAttempt: () => ({ attempt: 1, inputHash: hashA }),
      runAttempt,
      selectWinner: (previous) => previous,
      shouldStop: () => false,
    })
    expect(runAttempt).toHaveBeenCalledTimes(1)
    expect(result.suppressed).toBe(1)
  })
})

describe('suppression telemetry', () => {
  it('13–14. persists suppression metadata without prompt/article/API key', () => {
    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage1_writer',
      operation: 'quality_retry_suppressed',
      generationReason: 'quality_retry',
      retrySuppressedReason: 'unchanged_quality_retry',
      inputHash: 'abc123',
      promptSystemTokens: 10,
      productionInputTokens: 40,
      retryTriggers: ['body_short', 'İçerik: Belediye açıkladı', 'draft'],
    })
    expect(doc.retrySuppressedReason).toBe('unchanged_quality_retry')
    expect(doc.operation).toBe('quality_retry_suppressed')
    expect(doc.retryTriggers).toEqual(['body_short', 'draft'])
    const blob = JSON.stringify(doc)
    expect(blob).not.toMatch(/Belediye açıkladı/)
    expect(blob).not.toMatch(/sk-/i)
    expect(blob).not.toMatch(/DEEPSEEK_API_KEY/)
    expect(blob).not.toMatch(/previousDraft/)
  })

  it('drops unknown suppression reasons', () => {
    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage1_writer',
      operation: 'quality_retry_suppressed',
      retrySuppressedReason: 'please_retry_this_prompt_text',
    })
    expect(doc.retrySuppressedReason).toBeUndefined()
  })
})

describe('dashboard repeated-input classes and suppression stats', () => {
  it('does not label every repeated hash as an accidental duplicate', () => {
    const classified = classifyRepeatedStage1Inputs([
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        inputHash: 'h1',
        generationReason: 'quality_retry',
        inputTokens: 6000,
        outputTokens: 1000,
        createdAt: 1,
        traceId: 't1',
        queueId: 'q1',
      },
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        inputHash: 'h1',
        generationReason: 'quality_retry',
        inputTokens: 6000,
        outputTokens: 1000,
        createdAt: 2,
        traceId: 't1',
        queueId: 'q1',
      },
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        inputHash: 'h2',
        generationReason: 'continuation',
        createdAt: 3,
        traceId: 't1',
        queueId: 'q1',
      },
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        inputHash: 'h2',
        generationReason: 'continuation',
        createdAt: 4,
        traceId: 't1',
        queueId: 'q1',
      },
    ])
    expect(classified.byClass.unchanged_quality_retry.groups).toBe(1)
    expect(classified.byClass.continuation_repeat.groups).toBe(1)
    expect(classified.byClass.cross_queue_duplicate.groups).toBe(0)
  })

  it('counts suppressed retries as calls/tokens avoided', () => {
    const stats = measureUnchangedQualityRetrySuppression([
      {
        agentName: 'stage1_writer',
        operation: 'quality_retry_suppressed',
        retrySuppressedReason: 'unchanged_quality_retry',
        promptSystemTokens: 100,
        promptSourceTokens: 200,
        promptInstructionTokens: 50,
        promptOtherTokens: 10,
      },
      {
        agentName: 'stage1_writer',
        operation: 'generate_article',
        generationReason: 'quality_retry',
        outputTokens: 1100,
      },
    ])
    expect(stats.events).toBe(1)
    expect(stats.estimatedCallsAvoided).toBe(1)
    expect(stats.estimatedInputTokensAvoided).toBe(360)
    expect(stats.estimatedOutputTokensAvoided).toBe(1100)
    expect(stats.estimatedTokensAvoided).toBe(1460)
  })
})

describe('shouldSuppressUnchangedQualityRetry', () => {
  it('requires both hashes', () => {
    expect(shouldSuppressUnchangedQualityRetry({ previousInputHash: 'a' })).toBe(false)
    expect(shouldSuppressUnchangedQualityRetry({ nextInputHash: 'a' })).toBe(false)
    expect(shouldSuppressUnchangedQualityRetry({ previousInputHash: 'a', nextInputHash: 'b' })).toBe(false)
    expect(shouldSuppressUnchangedQualityRetry({ previousInputHash: 'a', nextInputHash: 'a' })).toBe(true)
  })
})
