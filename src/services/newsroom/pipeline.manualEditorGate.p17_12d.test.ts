import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { runWithAiUsageContext } from '@/lib/ai/usage/context'
import { processNewsroomArticle } from './pipeline'

function mockDb(): Firestore {
  const emptySnap = { empty: true, docs: [] as unknown[] }
  return {
    collection: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(emptySnap),
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
        collection: vi.fn(() => ({ add: vi.fn().mockResolvedValue({ id: 'hist_1' }) })),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  } as unknown as Firestore
}

describe('P17.12D processNewsroomArticle manual editor gate', () => {
  beforeEach(() => {
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'true')
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'false')
    vi.stubEnv('LEGACY_DIRECT_AI_ENABLED', 'false')
    vi.stubEnv('DEEPSEEK_API_KEY', '')

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('manual=true + crawler=false does not hit crawler gate after traceId bootstrap', async () => {
    const db = mockDb()
    const input = {
      editorId: 'national-news' as const,
      editorType: 'national' as const,
      sourceLabel: 'Test Source',
      sourceUrl: 'https://example.com/haber-1',
      originalTitle: 'Uzun başlık haber test',
      originalSummary: 'Özet metni',
      originalContent: 'x'.repeat(600),
      rssFingerprint: 'p17-12d-manual-gate',
    }

    const result = await runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () =>
      processNewsroomArticle(db, input, { skipStoryLibraryDedupe: true })
    )

    expect(result.skipReason).not.toBe('CRAWLER_AI_DISPATCH_ENABLED=false')
  })

  it('manual=false denies manual lane even when crawler=false', async () => {
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'false')
    const db = mockDb()
    const input = {
      editorId: 'national-news' as const,
      editorType: 'national' as const,
      sourceLabel: 'Test Source',
      sourceUrl: 'https://example.com/haber-1',
      originalTitle: 'Uzun başlık haber test',
      originalSummary: 'Özet metni',
      originalContent: 'x'.repeat(600),
      rssFingerprint: 'p17-12d-manual-off',
    }

    const result = await runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () =>
      processNewsroomArticle(db, input, { skipStoryLibraryDedupe: true })
    )

    expect(result.outcome).toBe('skipped')
    expect(result.skipReason).toBe('MANUAL_EDITOR_AI_ENABLED=false')
  })
})
