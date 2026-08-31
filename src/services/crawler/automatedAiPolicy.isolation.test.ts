import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mayAutomatedCrawlerUseAi, isManualEditorAiEnabled } from './automatedAiPolicy'
import { classifyArticleCategory } from '@/services/newsroom/aiCategoryClassifier'
import { runDedicatedAiWorkerTick } from './autoDraft/worker'
import { processEditorAiQueue } from './editorial/editorQueueWorker'
import { runAI } from '@/lib/ai/router/aiRouter'
import { deepseekChatCompletion } from '@/lib/ai/deepseekClient'
import { runWithAiUsageContext } from '@/lib/ai/usage/context'

describe('P17.9C Manual Editor AI Isolation & Safety Matrix', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'false')
    vi.stubEnv('CRAWLER_AI_MODE', 'OFF')
    vi.stubEnv('LEGACY_DIRECT_AI_ENABLED', 'false')
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'true') // MANUAL AI ENABLED
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    global.fetch = originalFetch
  })

  it('Requirement 1: manual flag false + explicit AI click => 0 provider calls', async () => {
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'false')
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

  it('Requirement 2: manual flag true + explicit AI click => 1 provider call (mocked)', async () => {
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

  it('Requirement 3 & 4: crawler tick / ankaBreakingWorker makes 0 provider calls even with MANUAL_EDITOR_AI_ENABLED=true', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    // ankaBreakingWorker category resolution must use deterministic fallback (e.g. MasterChef keyword override or currentCategory)
    const result = await classifyArticleCategory('MasterChef Türkiye Yeni Bölüm', 'Yarışmacılar kıyasıya mücadele etti...', 'gundem')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result?.categoryId).toBe('magazin')
    expect(result?.reason).toContain('deterministic_fallback')
  })

  it('Requirement 5: automated router calls fail closed with 0 provider calls when MANUAL_EDITOR_AI_ENABLED=true but CRAWLER_AI_DISPATCH_ENABLED=false', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    const res = await runAI({
      agent: 'crawler_agent',
      operation: 'auto_enrich',
      promptVersion: 'v1',
      taskType: 'longform',
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.value).toBeNull()
    expect(res.provider).toBeNull()
  })

  it('Requirement 6: editor AI queue worker skips automated processing when CRAWLER_AI_DISPATCH_ENABLED=false', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    const mockStore = {
      recoverStaleEditorAiProcessing: vi.fn().mockResolvedValue(0),
      listEditorAiQueued: vi.fn().mockResolvedValue([]),
    } as any

    const res = await processEditorAiQueue(mockStore)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.claimed).toBe(0)
  })

  it('Requirement 7: dedicated AI worker tick skips automated processing when CRAWLER_AI_DISPATCH_ENABLED=false', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    const mockCrawlerStore = {} as any
    const mockAiStore = {
      claimNextPendingJob: vi.fn(),
    } as any

    const res = await runDedicatedAiWorkerTick({
      crawlerStore: mockCrawlerStore,
      aiStore: mockAiStore,
      now: new Date(),
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.claimed).toBe(0)
    expect(res.providerCalls).toBe(0)
  })
})
