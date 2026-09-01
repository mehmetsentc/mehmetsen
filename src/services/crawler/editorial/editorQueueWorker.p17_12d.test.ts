import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processEditorAiQueue } from './editorQueueWorker'
import * as aiPublishModule from './aiPublish'
import * as aiUsageContext from '@/lib/ai/usage/context'

describe('P17.12D editor AI queue worker manual lane', () => {
  beforeEach(() => {
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'true')
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'false')
    vi.stubEnv('LEGACY_DIRECT_AI_ENABLED', 'false')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('claims one human-queued item under manual lane context', async () => {
    const runCtxSpy = vi.spyOn(aiUsageContext, 'runWithAiUsageContext')
    const publishSpy = vi.spyOn(aiPublishModule, 'publishRawArticleWithAi').mockResolvedValue({
      rawArticleId: 'raw_human_1',
      outcome: 'draft',
      newsId: 'news_1',
    })

    const mockStore = {
      recoverStaleEditorAiProcessing: vi.fn().mockResolvedValue(0),
      listEditorAiQueued: vi.fn().mockResolvedValue([{ id: 'raw_human_1', title: 'Human pick' }]),
      bulkSetEditorialStatus: vi.fn().mockResolvedValue(1),
      updateRawArticle: vi.fn().mockResolvedValue(undefined),
    } as any

    const result = await processEditorAiQueue(mockStore, 12, 1)

    expect(result.claimed).toBe(1)
    expect(result.drafted).toBe(1)
    expect(runCtxSpy).toHaveBeenCalledWith({ ingestionLane: 'manual_editor' }, expect.any(Function))
    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({ rawArticleId: 'raw_human_1' })
    )
  })

  it('accepts 25 requested ids at enqueue cap (documented batch behavior)', async () => {
    const { AI_ENQUEUE_BATCH_CAP, enqueueRawArticlesForAi } = await import('./aiEnqueue')
    expect(AI_ENQUEUE_BATCH_CAP).toBeGreaterThanOrEqual(25)

    const ids = Array.from({ length: 25 }, (_, i) => `raw_${i}`)
    const store = {
      bulkSetEditorialStatus: vi.fn().mockResolvedValue(25),
    } as any

    const result = await enqueueRawArticlesForAi(store, ids)
    expect(result.requested).toBe(25)
    expect(result.enqueued).toBe(25)
    expect(store.bulkSetEditorialStatus).toHaveBeenCalledWith(ids, 'AI_QUEUED')
  })
})
