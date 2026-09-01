import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { runWithAiUsageContext } from '@/lib/ai/usage/context'
import { processNewsroomArticle } from './pipeline'

const publishFromPipeline = vi.fn()

vi.mock('@/services/newsDraftService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/newsDraftService')>()
  return {
    ...actual,
    newsDraftService: {
      ...actual.newsDraftService,
      publishFromPipeline: (...args: unknown[]) => publishFromPipeline(...args),
    },
  }
})

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
      add: vi.fn().mockResolvedValue({ id: 'draft_manual_1' }),
    })),
  } as unknown as Firestore
}

describe('P17.13 manual AI editorial review safety', () => {
  beforeEach(() => {
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', 'true')
    vi.stubEnv('CRAWLER_AI_DISPATCH_ENABLED', 'false')
    vi.stubEnv('LEGACY_DIRECT_AI_ENABLED', 'false')
    vi.stubEnv('NEWSROOM_AUTO_PUBLISH_ENABLED', 'true')
    vi.stubEnv('DEEPSEEK_API_KEY', '')
    publishFromPipeline.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('needsDraft includes editorApproved in pipeline source', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/newsroom/pipeline.ts'), 'utf8')
    expect(src).toMatch(/const needsDraft[\s\S]*editorApproved/)
  })

  it('editor-approved manual AI does not call publishFromPipeline', async () => {
    const db = mockDb()
    const input = {
      editorId: 'national-news' as const,
      editorType: 'national' as const,
      sourceLabel: 'Test Source',
      sourceUrl: 'https://example.com/haber-1',
      originalTitle: 'Uzun başlık haber test',
      originalSummary: 'Özet metni',
      originalContent: 'x'.repeat(600),
      rssFingerprint: 'p17-13-manual-draft',
    }

    const result = await runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () =>
      processNewsroomArticle(db, input, { skipStoryLibraryDedupe: true })
    )

    expect(publishFromPipeline).not.toHaveBeenCalled()
    expect(result.outcome).not.toBe('published')
  })
})
