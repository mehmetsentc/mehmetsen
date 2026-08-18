import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isSkipRedundantClassifierEnabled } from '@/lib/ai/router/flags'
import { runWithAiUsageContext } from '@/lib/ai/usage/context'
import { inputCharLimit, optionalOutputTokenLimit } from '@/lib/ai/usage/tokenBudget'
import { buildAiUsageEventForTest } from '@/lib/ai/usage/telemetry'
import * as telemetry from '@/lib/ai/usage/telemetry'
import {
  STAGE3_COMPACT_SYSTEM,
  shouldUseStage3CompactPrompt,
  stage3CanaryBucket,
} from '@/services/newsroom/editors/stage3_compactPrompt'
import {
  STAGE3_CONTROL_SYSTEM,
  buildControlStage3UserPrompt,
  classifyArticle,
  parseStage3Output,
  stage3ValidCategoryIds,
} from '@/services/newsroom/editors/stage3_categoryEditor'
import type { WrittenArticle } from '@/services/newsroom/editors/stage1_contentWriter'

const written: WrittenArticle = {
  title: 'Çanakkale feribot tarifesi değişti',
  spot: 'Gökçeada hattında yeni saatler açıklandı.',
  summary: 'Gökçeada hattında yeni saatler açıklandı.',
  content: `${'x'.repeat(5000)} yerel ulaşım detayı.`,
  seoTitle: 'Feribot',
  seoDescription: 'Tarife',
  aiWritten: true,
}

const validJson = JSON.stringify({
  categoryId: 'yerel-haber',
  isBreaking: false,
  confidence: 80,
  city: 'Çanakkale',
  district: null,
  country: 'Türkiye',
  tags: ['feribot'],
  reason: 'tek şehir ulaşım',
})

function jsonResponse(content: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: status === 200 ? 120 : 0, completion_tokens: 18, total_tokens: 138 },
    }),
    text: async () => '',
  }
}

function findCohortKey(pred: (bucket: number) => boolean): string {
  for (let i = 0; i < 8000; i++) {
    const key = `news-canary-${i}`
    if (pred(stage3CanaryBucket(key))) return key
  }
  throw new Error('no matching cohort key')
}

describe('Stage3 compact canary', () => {
  const recorded: Array<Record<string, unknown>> = []

  beforeEach(() => {
    recorded.length = 0
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_ENABLED', '')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT', '')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_PERCENT', '')
    vi.spyOn(telemetry, 'recordAiRequestUsage').mockImplementation((input) => {
      recorded.push(input as unknown as Record<string, unknown>)
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('compact disabled → exact current control prompt', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> }
      expect(body.messages[0]?.content).toBe(STAGE3_CONTROL_SYSTEM)
      expect(body.messages[1]?.content).toContain('İçerik (tamamını oku')
      expect(body.messages[1]?.content).toContain('x'.repeat(4000))
      return jsonResponse(validJson)
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await classifyArticle(written, 'AA', 'gundem')
    expect(result.categoryId).toBe('yerel-haber')
    expect(result.source).toBe('deepseek')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(recorded[0]?.promptVariant).toBe('control')
  })

  it('compact 0% → control', async () => {
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_ENABLED', 'true')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_PERCENT', '0')
    expect(shouldUseStage3CompactPrompt('news-1')).toBe(false)
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => jsonResponse(validJson))
    vi.stubGlobal('fetch', fetchMock)
    await runWithAiUsageContext({ newsId: 'news-1' }, () => classifyArticle(written, 'AA'))
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>
    }
    expect(body.messages[0]?.content).toBe(STAGE3_CONTROL_SYSTEM)
    expect(recorded[0]?.promptVariant).toBe('control')
  })

  it('compact 100% test cohort → compact, no second control call', async () => {
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_ENABLED', 'true')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_PERCENT', '100')
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }
      expect(body.messages[0]?.content).toBe(STAGE3_COMPACT_SYSTEM)
      expect(body.messages[1]?.content).not.toContain('x'.repeat(1201))
      expect(body.messages[1]?.content).toContain('İçerik (ilk 1200')
      return jsonResponse(validJson)
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await runWithAiUsageContext({ newsId: 'news-100' }, () => classifyArticle(written, 'AA'))
    expect(result.categoryId).toBe('yerel-haber')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(recorded[0]?.promptVariant).toBe('compact')
    expect(typeof recorded[0]?.stage3CanaryBucket).toBe('number')
  })

  it('uses a deterministic SHA-256 bucket, not Math.random', () => {
    const a = stage3CanaryBucket('queue-abc')
    const b = stage3CanaryBucket('queue-abc')
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(100)
  })

  it('keeps the same news in the same cohort', () => {
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_ENABLED', 'true')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_PERCENT', '10')
    const inTen = findCohortKey((bucket) => bucket < 10)
    const outTen = findCohortKey((bucket) => bucket >= 10)
    expect(shouldUseStage3CompactPrompt(inTen)).toBe(true)
    expect(shouldUseStage3CompactPrompt(inTen)).toBe(true)
    expect(shouldUseStage3CompactPrompt(outTen)).toBe(false)
    expect(shouldUseStage3CompactPrompt(outTen)).toBe(false)
  })

  it('compact missing category is a parse failure', () => {
    const parsed = parseStage3Output(JSON.stringify({ isBreaking: false, confidence: 50 }), { strict: true })
    expect(parsed).toEqual({ ok: false, errorCode: 'missing_category' })
  })

  it('compact schema success parses required fields', () => {
    const parsed = parseStage3Output(validJson, { strict: true })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.categoryId).toBe('yerel-haber')
      expect(parsed.value.confidence).toBe(80)
      expect(parsed.value.isBreaking).toBe(false)
      expect(parsed.value.country).toBe('Türkiye')
      expect(parsed.value.tags).toContain('feribot')
    }
  })

  it('compact invalid JSON → one control fallback', async () => {
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_ENABLED', 'true')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_PERCENT', '100')
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }
      if (body.messages[0]?.content === STAGE3_COMPACT_SYSTEM) {
        return jsonResponse('not-json')
      }
      expect(body.messages[0]?.content).toBe(STAGE3_CONTROL_SYSTEM)
      return jsonResponse(validJson)
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await classifyArticle(written, 'AA')
    expect(result.categoryId).toBe('yerel-haber')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(recorded.map((e) => e.promptVariant)).toEqual(['compact', 'control_fallback'])
    expect(recorded[0]?.errorCode).toBe('invalid_json')
    expect(recorded[1]?.fallbackReason).toBe('invalid_json')
  })

  it('compact missing category → one control fallback', async () => {
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_ENABLED', 'true')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_PERCENT', '100')
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }
      if (body.messages[0]?.content === STAGE3_COMPACT_SYSTEM) {
        return jsonResponse(JSON.stringify({ isBreaking: false, confidence: 40, tags: [] }))
      }
      return jsonResponse(validJson)
    })
    vi.stubGlobal('fetch', fetchMock)
    await classifyArticle(written, 'AA')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(recorded[0]?.errorCode).toBe('missing_category')
  })

  it('compact invalid category → one control fallback', async () => {
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_ENABLED', 'true')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_PERCENT', '100')
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }
      if (body.messages[0]?.content === STAGE3_COMPACT_SYSTEM) {
        return jsonResponse(JSON.stringify({ categoryId: 'not-a-real-id', confidence: 90, isBreaking: false }))
      }
      return jsonResponse(validJson)
    })
    vi.stubGlobal('fetch', fetchMock)
    await classifyArticle(written, 'AA')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(recorded[0]?.errorCode).toBe('invalid_category')
    expect(recorded[1]?.promptVariant).toBe('control_fallback')
  })

  it('compact timeout → one control fallback', async () => {
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_ENABLED', 'true')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_PERCENT', '100')
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }
      if (body.messages[0]?.content === STAGE3_COMPACT_SYSTEM) {
        const err = new Error('The operation was aborted due to timeout')
        err.name = 'TimeoutError'
        throw err
      }
      return jsonResponse(validJson)
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await classifyArticle(written, 'AA')
    expect(result.categoryId).toBe('yerel-haber')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(recorded[0]?.errorCode).toBe('timeout')
    expect(recorded[1]?.promptVariant).toBe('control_fallback')
  })

  it('fallback is at most one additional Stage3 call', async () => {
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_ENABLED', 'true')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_PERCENT', '100')
    const fetchMock = vi.fn(async () => jsonResponse('nope'))
    vi.stubGlobal('fetch', fetchMock)
    await classifyArticle(written, 'AA')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('total DeepSeek failure stamps source=heuristic and keeps fallback', async () => {
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_ENABLED', 'true')
    vi.stubEnv('AI_STAGE3_COMPACT_PROMPT_PERCENT', '100')
    const fetchMock = vi.fn(async () => jsonResponse('nope'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await classifyArticle(written, 'AA')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.source).toBe('heuristic')
    expect(result.reason).toContain('heuristik')
  })

  it('does not skip the redundant classifier by default', () => {
    vi.stubEnv('AI_SKIP_REDUNDANT_CLASSIFIER', '')
    expect(isSkipRedundantClassifierEnabled()).toBe(false)
  })

  it('records promptVariant without prompt/content/API key fields', () => {
    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage3_category',
      operation: 'classify_category',
      provider: 'deepseek',
      promptVariant: 'compact',
      stage3CanaryBucket: 7,
      resultCategoryId: 'siyaset',
    })
    expect(doc.promptVariant).toBe('compact')
    expect(doc.stage3CanaryBucket).toBe(7)
    expect(doc.schemaVersion).toBe(1)
    expect(doc).not.toHaveProperty('prompt')
    expect(doc).not.toHaveProperty('content')
    expect(doc).not.toHaveProperty('messages')
    expect(doc).not.toHaveProperty('apiKey')
    expect(doc).not.toHaveProperty('api_key')
  })

  it('keeps token-budget absent behavior for control slice', () => {
    vi.stubEnv('AI_STAGE3_MAX_INPUT_CHARS', '')
    vi.stubEnv('AI_STAGE3_MAX_OUTPUT_TOKENS', '')
    expect(inputCharLimit('AI_STAGE3_MAX_INPUT_CHARS', 6000)).toBe(6000)
    expect(optionalOutputTokenLimit('AI_STAGE3_MAX_OUTPUT_TOKENS')).toBeNull()
    const control = buildControlStage3UserPrompt({
      title: 'T',
      content: 'y'.repeat(8000),
      sourceLabel: 'AA',
    })
    expect(control).toContain('y'.repeat(6000))
    expect(control).not.toContain('y'.repeat(6001))
  })

  it('compact output schema lists the same required JSON keys as control', () => {
    const compact = parseStage3Output(validJson, { strict: true })
    const control = parseStage3Output(validJson, { strict: false })
    expect(compact.ok && control.ok).toBe(true)
    if (compact.ok && control.ok) {
      expect(Object.keys(compact.value).sort()).toEqual(Object.keys(control.value).sort())
    }
    expect(stage3ValidCategoryIds().length).toBeGreaterThan(40)
  })
})
