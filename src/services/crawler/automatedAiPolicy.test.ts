import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mayAutomatedCrawlerUseAi, isManualEditorAiEnabled } from './automatedAiPolicy'
import { classifyArticleCategory, classifyYerelSubcategory, classifyKibrisSubcategory } from '@/services/newsroom/aiCategoryClassifier'
import { runWithAiUsageContext } from '@/lib/ai/usage/context'
import { runAI } from '@/lib/ai/router/aiRouter'
import { deepseekChatCompletion } from '@/lib/ai/deepseekClient'
import { publishRawArticleWithAi } from './editorial/aiPublish'

describe('Global Crawler & Editor AI Cost Containment Policy', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'false')
    vi.stubEnv('CRAWLER_AI_MODE', 'OFF')
    vi.stubEnv('LEGACY_DIRECT_AI_ENABLED', 'false')
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'false')
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    global.fetch = originalFetch
  })

  it('mayAutomatedCrawlerUseAi fails closed when CRAWLER_AI_DISPATCH_ENABLED is false', () => {
    expect(mayAutomatedCrawlerUseAi()).toBe(false)
  })

  it('isManualEditorAiEnabled fails closed when unset and allows explicit true only', () => {
    vi.unstubAllEnvs()
    delete process.env.MANUAL_EDITOR_AI_ENABLED
    expect(isManualEditorAiEnabled()).toBe(false)
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'true')
    expect(isManualEditorAiEnabled()).toBe(true)
  })

  it('classifyArticleCategory uses deterministic fallback and makes 0 provider calls when AI is OFF', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    const result = await classifyArticleCategory(
      'MasterChef Türkiye yeni bölüm fragmanı',
      'MasterChef yarışmasında bu akşam eleme heyecanı...',
      'gundem'
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result?.categoryId).toBe('magazin') // MasterChef keyword override
    expect(result?.reason).toContain('deterministic_fallback')
  })

  it('classifyYerelSubcategory returns null with 0 provider calls when AI is OFF', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    const result = await classifyYerelSubcategory(
      'Çanakkale belediyesi su kesintisi',
      'Su kesintisi yapılacak...'
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('classifyKibrisSubcategory returns null with 0 provider calls when AI is OFF', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    const result = await classifyKibrisSubcategory(
      'KKTC meclisinde bütçe görüşmeleri',
      'Cumhuriyet Meclisinde bütçe...'
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('runAI router boundary fails closed with 0 provider calls for automated caller when AI is OFF', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    const result = await runAI({
      agent: 'test_agent',
      operation: 'test_op',
      promptVersion: 'v1',
      taskType: 'classification',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.value).toBeNull()
    expect(result.provider).toBeNull()
  })

  it('deepseekChatCompletion boundary fails closed when automated AI is OFF', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    await expect(
      deepseekChatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      })
    ).rejects.toThrow(/CRAWLER_AI_DISPATCH_ENABLED=false/)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('deepseekChatCompletion boundary fails closed for manual editor when MANUAL_EDITOR_AI_ENABLED is false', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    await expect(
      runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () =>
        deepseekChatCompletion({
          messages: [{ role: 'user', content: 'test' }],
        })
      )
    ).rejects.toThrow(/MANUAL_EDITOR_AI_ENABLED=false/)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('publishRawArticleWithAi skips execution without calling pipeline when AI is OFF', async () => {
    const processArticleMock = vi.fn()
    const mockStore = {
      getRawArticle: vi.fn(),
      getSource: vi.fn(),
    } as any

    const result = await publishRawArticleWithAi({
      store: mockStore,
      rawArticleId: 'raw_test_123',
      processArticle: processArticleMock,
    })

    expect(result.outcome).toBe('skipped')
    expect(result.error).toContain('MANUAL_EDITOR_AI_ENABLED=false')
    expect(mockStore.getRawArticle).not.toHaveBeenCalled()
    expect(processArticleMock).not.toHaveBeenCalled()
  })

  it('allows manual editor AI execution only when MANUAL_EDITOR_AI_ENABLED is explicitly true (with mock)', async () => {
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'true')
    expect(isManualEditorAiEnabled()).toBe(true)

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"status":"ok"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
        { status: 200 }
      )
    )
    global.fetch = fetchMock

    const res = await runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () =>
      deepseekChatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      })
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res).toBe('{"status":"ok"}')
  })
})
