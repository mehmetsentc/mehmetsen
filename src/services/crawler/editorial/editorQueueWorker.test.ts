import { describe, expect, it, vi } from 'vitest'
import { EDITOR_AI_STALE_PROCESSING_MS, processEditorAiQueue } from './editorQueueWorker'
import type { DrizzleCrawlerStore } from '../store/drizzle'

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
})
