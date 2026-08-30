import { describe, expect, it, vi } from 'vitest'
import {
  EDITOR_AI_STALE_PROCESSING_MS,
  WORKER_BATCH_SIZE,
  WORKER_CONCURRENCY,
  processEditorAiQueue,
} from './editorQueueWorker'
import type { DrizzleCrawlerStore } from '../store/drizzle'
import * as aiPublishModule from './aiPublish'

function mockStore(overrides: Partial<DrizzleCrawlerStore> = {}): DrizzleCrawlerStore {
  return {
    recoverStaleEditorAiProcessing: vi.fn().mockResolvedValue(0),
    listEditorAiQueued: vi.fn().mockResolvedValue([]),
    bulkSetEditorialStatus: vi.fn().mockResolvedValue(0),
    updateRawArticle: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as DrizzleCrawlerStore
}

describe('processEditorAiQueue', () => {
  it('recovers stale AI_PROCESSING before claiming new work', async () => {
    const store = mockStore({
      recoverStaleEditorAiProcessing: vi.fn().mockResolvedValue(3),
      listEditorAiQueued: vi.fn().mockResolvedValue([]),
    })

    const result = await processEditorAiQueue(store)

    expect(store.recoverStaleEditorAiProcessing).toHaveBeenCalledWith(
      expect.any(Date),
      EDITOR_AI_STALE_PROCESSING_MS
    )
    expect(result.recovered).toBe(3)
    expect(result.claimed).toBe(0)
  })

  it('claims items as AI_PROCESSING and processes them with error isolation', async () => {
    const queuedItems = [
      { id: 'raw_1', title: 'Haber 1' },
      { id: 'raw_2', title: 'Haber 2' },
      { id: 'raw_3', title: 'Haber 3' },
    ] as any

    const store = mockStore({
      listEditorAiQueued: vi.fn().mockResolvedValue(queuedItems),
      bulkSetEditorialStatus: vi.fn().mockResolvedValue(3),
      updateRawArticle: vi.fn().mockResolvedValue(undefined),
    })

    const publishSpy = vi.spyOn(aiPublishModule, 'publishRawArticleWithAi').mockImplementation(async ({ rawArticleId }) => {
      if (rawArticleId === 'raw_1') {
        return { rawArticleId, outcome: 'published' as const, newsId: 'news_1' }
      }
      if (rawArticleId === 'raw_2') {
        return { rawArticleId, outcome: 'skipped' as const, error: 'Atlandı: Görsel yok' }
      }
      throw new Error('AI network timeout')
    })

    const result = await processEditorAiQueue(store, 10, 2)

    expect(store.bulkSetEditorialStatus).toHaveBeenCalledWith(['raw_1', 'raw_2', 'raw_3'], 'AI_PROCESSING', { force: true })
    expect(result.claimed).toBe(3)
    expect(result.published).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(1)

    // Verify skipped item records reason
    expect(store.updateRawArticle).toHaveBeenCalledWith('raw_2', expect.objectContaining({
      editorialStatus: 'NEW',
      aiSkipReason: 'Atlandı: Görsel yok',
    }))

    // Verify failed item records error
    expect(store.updateRawArticle).toHaveBeenCalledWith('raw_3', expect.objectContaining({
      editorialStatus: 'NEW',
      aiSkipReason: 'AI network timeout',
    }))

    publishSpy.mockRestore()
  })

  it('exposes safe batch size and concurrency constants', () => {
    expect(WORKER_BATCH_SIZE).toBe(12)
    expect(WORKER_CONCURRENCY).toBe(4)
    expect(EDITOR_AI_STALE_PROCESSING_MS).toBe(3 * 60 * 1000)
  })
})
