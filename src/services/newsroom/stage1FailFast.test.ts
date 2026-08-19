import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'
import { shouldRunQualityRetry, shouldRunStage1Continuation } from '@/lib/ai/stage1RetryOptimization'
import { evaluateArticleCompleteness, qualityDiscardSkipReason } from '@/services/newsroom/pipelineQualityDiscard'
import { decideStage1FailFast, isStage1FailFastEnabled } from '@/services/newsroom/stage1FailFast'
import { buildAiUsageEventForTest } from '@/lib/ai/usage/telemetry'

const writeArticle = vi.fn()
const classifyArticle = vi.fn()
const factCheckerCheck = vi.fn()
const classifyArticleCategory = vi.fn()
const runChiefEditor = vi.fn()

vi.mock('@/services/newsroom/editors/stage1_contentWriter', () => ({
  writeArticle: (...args: unknown[]) => writeArticle(...args),
}))

vi.mock('@/services/newsroom/editors/stage3_categoryEditor', () => ({
  classifyArticle: (...args: unknown[]) => classifyArticle(...args),
}))

vi.mock('@/services/newsroom/factChecker', () => ({
  factChecker: {
    check: (...args: unknown[]) => factCheckerCheck(...args),
  },
}))

vi.mock('@/services/newsroom/aiCategoryClassifier', () => ({
  classifyArticleCategory: (...args: unknown[]) => classifyArticleCategory(...args),
  classifyYerelSubcategory: vi.fn(),
  classifyKibrisSubcategory: vi.fn(),
}))

vi.mock('@/services/newsroom/chiefEditor', async () => {
  const actual = await vi.importActual<typeof import('@/services/newsroom/chiefEditor')>(
    '@/services/newsroom/chiefEditor'
  )
  return {
    ...actual,
    runChiefEditor: (...args: unknown[]) => runChiefEditor(...args),
  }
})

import { runMultiStageEditor } from '@/services/newsroom/editors/multiStageEditor'

function words(n: number, word = 'haber'): string {
  return Array.from({ length: n }, () => word).join(' ')
}

function completeArticle(overrides?: Partial<{ title: string; spot: string; summary: string; content: string }>) {
  const content = `${words(MIN_NEWS_BODY_WORDS)} biter.`
  return {
    title: 'Meclis yasa kabul etti',
    spot: 'Meclis gece oturumunda yasa tasarısını kabul etti.',
    summary: 'Milletvekilleri oylamada tasarının kabul edildiğini açıkladı.',
    content,
    seoTitle: 'Meclis yasa kabul etti',
    seoDescription: 'Meclis gece oturumunda yasa tasarısını kabul etti.',
    aiWritten: true,
    ...overrides,
  }
}

const editorInput = {
  sourceLabel: 'AA',
  originalTitle: 'Meclis yasa kabul etti',
  originalSummary: 'Oylama tamamlandı.',
  originalContent: `${words(80)} kaynak.`,
  sourceUrl: 'https://example.com/meclis',
}

describe('Phase 2L Stage1 fail-fast', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    writeArticle.mockReset()
    classifyArticle.mockReset()
    factCheckerCheck.mockReset()
    classifyArticleCategory.mockReset()
    runChiefEditor.mockReset()
    classifyArticle.mockResolvedValue({
      categoryId: 'siyaset',
      isBreaking: false,
      confidence: 82,
      city: 'Ankara',
      district: null,
      country: 'Türkiye',
      tags: ['meclis'],
      reason: 'meclis',
      source: 'deepseek',
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('1. short doomed article → fail-fast', () => {
    const short = completeArticle({ content: `${words(40)} biter.` })
    const completeness = evaluateArticleCompleteness({
      title: short.title,
      spot: short.spot,
      summary: short.summary,
      description: short.content,
    })
    expect(completeness.reason).toBe('body_too_short')
    const decision = decideStage1FailFast({
      enabled: true,
      article: {
        title: short.title,
        spot: short.spot,
        summary: short.summary,
        description: short.content,
      },
    })
    expect(decision.skip).toBe(true)
    if (decision.skip) {
      expect(decision.skipReason).toBe('quality:body_too_short')
      expect(decision.reason).toBe('body_too_short')
    }
  })

  it('2. incomplete doomed article → fail-fast', () => {
    const incomplete = completeArticle({
      content: `${words(MIN_NEWS_BODY_WORDS)} bu paragraf yarım kaldı çünkü bağlaçla bitiyor ve`,
    })
    const completeness = evaluateArticleCompleteness({
      title: incomplete.title,
      spot: incomplete.spot,
      summary: incomplete.summary,
      description: incomplete.content,
    })
    expect(completeness.reason).toBe('incomplete_text')
    const decision = decideStage1FailFast({
      enabled: true,
      article: {
        title: incomplete.title,
        spot: incomplete.spot,
        summary: incomplete.summary,
        description: incomplete.content,
      },
    })
    expect(decision.skip).toBe(true)
    if (decision.skip) expect(decision.skipReason).toBe('quality:incomplete_text')
  })

  it('3. healthy article → continue', () => {
    const healthy = completeArticle()
    const completeness = evaluateArticleCompleteness({
      title: healthy.title,
      spot: healthy.spot,
      summary: healthy.summary,
      description: healthy.content,
    })
    expect(completeness.reason).toBeNull()
    expect(
      decideStage1FailFast({
        enabled: true,
        article: {
          title: healthy.title,
          spot: healthy.spot,
          summary: healthy.summary,
          description: healthy.content,
        },
      }).skip
    ).toBe(false)
  })

  it('4. published-quality article → continue', () => {
    const published = completeArticle({
      content: `${words(280, 'belediye')} aciklama yapti. Ikinci paragraf da nokta ile biter.`,
    })
    expect(
      evaluateArticleCompleteness({
        title: published.title,
        spot: published.spot,
        summary: published.summary,
        description: published.content,
      }).reason
    ).toBeNull()
  })

  it('5. retry-eligible short article → mevcut retry davranışını koru', async () => {
    vi.stubEnv('STAGE1_FAIL_FAST_ENABLED', 'true')
    const short = completeArticle({ content: `${words(40)} biter.` })
    expect(
      shouldRunQualityRetry(
        {
          gateDecision: 'draft',
          publishScore: 40,
          categoryConfidence: 50,
          title: short.title,
          spot: short.spot,
          summary: short.summary,
          description: short.content,
          aiWritten: true,
        },
        false
      )
    ).toBe(true)
    writeArticle.mockResolvedValue(short)
    const result = await runMultiStageEditor(editorInput)
    expect(result.description).toBe(short.content)
    expect(result.stage1FailFastTriggered).toBe(true)
    expect(classifyArticle).not.toHaveBeenCalled()
  })

  it('6. continuation ile kurtarılabilir article → erken öldürülmesin', () => {
    const afterContinuation = completeArticle()
    expect(shouldRunStage1Continuation({ ...afterContinuation }, false)).toBe(false)
    expect(
      decideStage1FailFast({
        enabled: true,
        article: {
          title: afterContinuation.title,
          spot: afterContinuation.spot,
          summary: afterContinuation.summary,
          description: afterContinuation.content,
        },
      }).skip
    ).toBe(false)
  })

  it('7. fail-fast sonrası Stage3 çağrılmıyor', async () => {
    vi.stubEnv('STAGE1_FAIL_FAST_ENABLED', 'true')
    writeArticle.mockResolvedValue(completeArticle({ content: `${words(40)} biter.` }))
    await runMultiStageEditor(editorInput)
    expect(classifyArticle).not.toHaveBeenCalled()
  })

  it('8-10. fail-fast sonrası FactChecker/classifier/Chief çağrılmıyor', () => {
    const decision = decideStage1FailFast({
      enabled: true,
      stage3AlreadySuppressed: true,
      article: {
        title: 'Meclis yasa kabul etti',
        spot: 'Meclis gece oturumunda yasa tasarısını kabul etti.',
        summary: 'Milletvekilleri oylamada tasarının kabul edildiğini açıkladı.',
        description: `${words(40)} biter.`,
      },
    })
    expect(decision.skip).toBe(true)
    if (decision.skip) {
      expect(decision.estimatedRequestsAvoided).toBe(4)
      expect(decision.skipReason.startsWith('quality:')).toBe(true)
    }
    expect(factCheckerCheck).not.toHaveBeenCalled()
    expect(classifyArticleCategory).not.toHaveBeenCalled()
    expect(runChiefEditor).not.toHaveBeenCalled()
  })

  it('11. canonical skip reason korunuyor', () => {
    expect(qualityDiscardSkipReason('body_too_short')).toBe('quality:body_too_short')
    expect(qualityDiscardSkipReason('incomplete_text')).toBe('quality:incomplete_text')
    const incomplete = decideStage1FailFast({
      enabled: true,
      article: {
        title: 'Meclis yasa kabul etti',
        spot: 'Meclis gece oturumunda yasa tasarısını kabul etti.',
        summary: 'Milletvekilleri oylamada tasarının kabul edildiğini açıkladı.',
        description: `${words(MIN_NEWS_BODY_WORDS)} bu paragraf yarım kaldı çünkü bağlaçla bitiyor ve`,
      },
    })
    expect(incomplete.skip && incomplete.skipReason).toBe('quality:incomplete_text')
  })

  it('12. feature flag OFF → legacy behavior', async () => {
    vi.stubEnv('STAGE1_FAIL_FAST_ENABLED', '')
    expect(isStage1FailFastEnabled()).toBe(false)
    writeArticle.mockResolvedValue(completeArticle({ content: `${words(40)} biter.` }))
    await runMultiStageEditor(editorInput)
    expect(classifyArticle).toHaveBeenCalledTimes(1)
    expect(
      decideStage1FailFast({
        article: {
          title: 'Meclis yasa kabul etti',
          spot: 'Meclis gece oturumunda yasa tasarısını kabul etti.',
          summary: 'Milletvekilleri oylamada tasarının kabul edildiğini açıkladı.',
          description: `${words(40)} biter.`,
        },
      }).skip
    ).toBe(false)
  })

  it('healthy article still calls Stage3 when flag ON', async () => {
    vi.stubEnv('STAGE1_FAIL_FAST_ENABLED', 'true')
    writeArticle.mockResolvedValue(completeArticle())
    const result = await runMultiStageEditor(editorInput)
    expect(classifyArticle).toHaveBeenCalledTimes(1)
    expect(result.stage3Suppressed).toBe(false)
    expect(result.stage1FailFastTriggered).toBe(false)
  })

  it('telemetry stores fail-fast flags without article body', () => {
    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage1_fail_fast',
      operation: 'downstream_skip',
      provider: 'heuristic',
      stage1FailFastTriggered: true,
      stage1FailFastReason: 'body_too_short',
      stage1OutputWordCount: 40,
      stage1OutputCharCount: 200,
      downstreamAiSuppressed: true,
      estimatedRequestsAvoided: 4,
    })
    expect(doc.stage1FailFastTriggered).toBe(true)
    expect(doc.stage1FailFastReason).toBe('body_too_short')
    expect(doc.downstreamAiSuppressed).toBe(true)
    expect(doc.estimatedRequestsAvoided).toBe(4)
    expect(JSON.stringify(doc)).not.toMatch(/Meclis/)
    expect(JSON.stringify(doc)).not.toMatch(/İçerik:/)
  })
})
