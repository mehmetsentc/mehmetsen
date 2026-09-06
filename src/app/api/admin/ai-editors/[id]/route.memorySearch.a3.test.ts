import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAiEditorById } from '@/lib/ai/editorial/aiEditorService'
import { buildEditorPrompt } from '@/lib/ai/editorial/promptBuilder'
import { resolveModelForEditor } from '@/lib/ai/editorial/modelRouter'
import { callDeepSeek } from '@/lib/ai/editorial/sandboxCall'
import { retrieveHistoricalContext } from '@/services/editorial/editorialMemoryRetrieval'
import type { AiEditorDocument } from '@/types/aiEditor'

vi.mock('@/lib/cmsAuthServer', () => ({
  verifyCmsToken: vi.fn(),
}))

vi.mock('@/lib/ai/editorial/aiEditorService', () => ({
  archiveAiEditor: vi.fn(),
  getAiEditorById: vi.fn(),
  getActivePrompt: vi.fn(),
  setPromptVersion: vi.fn(),
  updateAiEditor: vi.fn(),
}))

vi.mock('@/lib/ai/editorial/editorRouter', () => ({
  invalidateEditorRouterCache: vi.fn(),
}))

vi.mock('@/lib/ai/editorial/promptBuilder', () => ({
  buildEditorPrompt: vi.fn(),
}))

vi.mock('@/lib/ai/editorial/modelRouter', () => ({
  resolveModelForEditor: vi.fn(),
}))

vi.mock('@/lib/ai/editorial/sandboxCall', () => ({
  callDeepSeek: vi.fn(),
}))

vi.mock('@/services/editorial/editorialMemoryRetrieval', () => ({
  retrieveHistoricalContext: vi.fn(),
}))

import { PATCH } from './route'

function fakeEditor(overrides: Partial<AiEditorDocument> = {}): AiEditorDocument {
  return {
    id: 'ed_1',
    authorUid: 'ai_ed_1',
    name: 'Test Editör',
    slug: 'test-editor',
    avatarUrl: null,
    coverUrl: null,
    title: 'Editör',
    shortBio: '',
    bio: '',
    columnName: null,
    primarySpecialization: 'Gündem',
    specializations: [],
    categoryIds: ['gundem'],
    managedCategories: ['gundem', 'ekonomi'],
    citySlug: 'izmir',
    languages: ['tr'],
    status: 'active',
    isAI: true,
    verified: false,
    capabilities: {} as AiEditorDocument['capabilities'],
    publishPolicy: {} as AiEditorDocument['publishPolicy'],
    maxDailyNews: 10,
    maxDailyColumns: 2,
    ...overrides,
  } as AiEditorDocument
}

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/admin/ai-editors/ed_1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

const ctx = { params: Promise.resolve({ id: 'ed_1' }) }

describe('Faz A3 Task 12/13/19/21/22 — PATCH memorySearch action', () => {
  afterEach(() => {
    vi.mocked(verifyCmsToken).mockReset()
    vi.mocked(getAiEditorById).mockReset()
    vi.mocked(retrieveHistoricalContext).mockReset()
    vi.mocked(buildEditorPrompt).mockReset()
    vi.mocked(resolveModelForEditor).mockReset()
    vi.mocked(callDeepSeek).mockReset()
  })

  it('requires CMS auth — same pair as the existing sandbox/setPrompt actions', async () => {
    vi.mocked(verifyCmsToken).mockResolvedValue(null)
    const res = await PATCH(patchRequest({ action: 'memorySearch', article: { headline: 'x' } }), ctx)
    expect(res.status).toBe(401)
    expect(vi.mocked(retrieveHistoricalContext)).not.toHaveBeenCalled()
  })

  it('404s when the editor does not exist', async () => {
    vi.mocked(verifyCmsToken).mockResolvedValue({ uid: 'admin_1' } as never)
    vi.mocked(getAiEditorById).mockResolvedValue(null)
    const res = await PATCH(patchRequest({ action: 'memorySearch', article: { headline: 'x' } }), ctx)
    expect(res.status).toBe(404)
  })

  it('requires a headline before calling the retrieval service', async () => {
    vi.mocked(verifyCmsToken).mockResolvedValue({ uid: 'admin_1' } as never)
    vi.mocked(getAiEditorById).mockResolvedValue(fakeEditor())
    const res = await PATCH(patchRequest({ action: 'memorySearch', article: {} }), ctx)
    expect(res.status).toBe(400)
    expect(vi.mocked(retrieveHistoricalContext)).not.toHaveBeenCalled()
  })

  it('calls retrieveHistoricalContext with the article + editor context, and causes ZERO AI calls / ZERO DB writes', async () => {
    vi.mocked(verifyCmsToken).mockResolvedValue({ uid: 'admin_1' } as never)
    vi.mocked(getAiEditorById).mockResolvedValue(fakeEditor())
    vi.mocked(retrieveHistoricalContext).mockResolvedValue({
      results: [],
      noResultReason: 'NO_CANONICAL_CANDIDATES',
      candidatesConsideredByBucket: {
        '2-7d': 0,
        '8-30d': 0,
        '1-3mo': 0,
        '3-12mo': 0,
        '12mo+': 0,
      },
    })

    const res = await PATCH(
      patchRequest({
        action: 'memorySearch',
        article: {
          headline: 'Test başlık',
          summary: 'Test özet',
          categoryId: 'gundem',
          citySlug: 'izmir',
          articleId: 'current_article_1',
          slug: 'current-slug',
        },
      }),
      ctx
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.memorySearch).toBe(true)
    expect(body.aiCalls).toBe(0)
    expect(body.dbWrites).toBe(0)
    expect(body.promptInjection).toBe(false)
    expect(body.noResultReason).toBe('NO_CANONICAL_CANDIDATES')

    expect(vi.mocked(retrieveHistoricalContext)).toHaveBeenCalledTimes(1)
    const [inputArg, editorCtxArg] = vi.mocked(retrieveHistoricalContext).mock.calls[0]
    expect(inputArg).toMatchObject({
      headline: 'Test başlık',
      summary: 'Test özet',
      categoryId: 'gundem',
      citySlug: 'izmir',
      articleId: 'current_article_1',
      slug: 'current-slug',
    })
    expect(editorCtxArg).toMatchObject({
      editorId: 'ed_1',
      managedCategories: ['gundem', 'ekonomi'],
      citySlug: 'izmir',
    })

    expect(vi.mocked(callDeepSeek)).not.toHaveBeenCalled()
    expect(vi.mocked(buildEditorPrompt)).not.toHaveBeenCalled()
    expect(vi.mocked(resolveModelForEditor)).not.toHaveBeenCalled()
  })
})
