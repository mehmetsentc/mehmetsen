import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processEditorAiQueue } from './editorQueueWorker'

describe('P17.12 editor AI queue manual gate', () => {
  beforeEach(() => {
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'false')
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'false')
    vi.stubEnv('LEGACY_DIRECT_AI_ENABLED', 'false')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not claim queue items when MANUAL_EDITOR_AI_ENABLED=false', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    const mockStore = {
      recoverStaleEditorAiProcessing: vi.fn(),
      listEditorAiQueued: vi.fn(),
      bulkSetEditorialStatus: vi.fn(),
    } as any

    const res = await processEditorAiQueue(mockStore)

    expect(res.claimed).toBe(0)
    expect(mockStore.recoverStaleEditorAiProcessing).not.toHaveBeenCalled()
    expect(mockStore.listEditorAiQueued).not.toHaveBeenCalled()
    expect(mockStore.bulkSetEditorialStatus).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('enqueue path alone does not call provider (worker idle with empty queue)', async () => {
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'true')
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    const mockStore = {
      recoverStaleEditorAiProcessing: vi.fn().mockResolvedValue(0),
      listEditorAiQueued: vi.fn().mockResolvedValue([]),
    } as any

    const res = await processEditorAiQueue(mockStore)
    expect(res.claimed).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
