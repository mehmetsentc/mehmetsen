import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
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

describe('P17.12D2 editor-approved options force manual lane (no ALS)', () => {
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

  it('skipStoryLibraryDedupe alone does not hit crawler gate (ALS absent)', async () => {
    const db = mockDb()
    const input = {
      editorId: 'national-news' as const,
      editorType: 'national' as const,
      sourceLabel: 'Test Source',
      sourceUrl: 'https://example.com/haber-als-loss',
      originalTitle: 'Uzun başlık haber test ALS kaybı',
      originalSummary: 'Özet metni',
      originalContent: 'x'.repeat(600),
      rssFingerprint: 'p17-12d2-no-als',
    }

    // No runWithAiUsageContext — simulates ALS loss across dynamic import.
    const result = await processNewsroomArticle(db, input, { skipStoryLibraryDedupe: true })

    expect(result.skipReason).not.toBe('CRAWLER_AI_DISPATCH_ENABLED=false')
  })

  it('without editor approval, crawler=false still blocks automated path', async () => {
    const db = mockDb()
    const input = {
      editorId: 'national-news' as const,
      editorType: 'national' as const,
      sourceLabel: 'Test Source',
      sourceUrl: 'https://example.com/haber-crawler',
      originalTitle: 'Uzun başlık crawler path',
      originalSummary: 'Özet metni',
      originalContent: 'x'.repeat(600),
      rssFingerprint: 'p17-12d2-crawler-block',
    }

    const result = await processNewsroomArticle(db, input, {})

    expect(result.outcome).toBe('skipped')
    expect(result.skipReason).toBe('CRAWLER_AI_DISPATCH_ENABLED=false')
  })

  it('manual=false denies even with skipStoryLibraryDedupe', async () => {
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'false')
    const db = mockDb()
    const input = {
      editorId: 'national-news' as const,
      editorType: 'national' as const,
      sourceLabel: 'Test Source',
      sourceUrl: 'https://example.com/haber-manual-off',
      originalTitle: 'Uzun başlık manual off',
      originalSummary: 'Özet metni',
      originalContent: 'x'.repeat(600),
      rssFingerprint: 'p17-12d2-manual-off',
    }

    const result = await processNewsroomArticle(db, input, { skipStoryLibraryDedupe: true })

    expect(result.outcome).toBe('skipped')
    expect(result.skipReason).toBe('MANUAL_EDITOR_AI_ENABLED=false')
  })
})
