import { describe, expect, it, vi } from 'vitest'
import { factChecker } from './factChecker'
import type { AiRewriteResult } from '@/services/aiNewsEditor'

const rewritten = {
  title: 'Belediye parkı yeniledi',
  description: 'Çanakkale Belediyesi sahil parkını yeniledi. Çalışma 3 günde bitti.',
  summary: 'Park yenilendi',
  seoTitle: 'Park yenilendi',
  seoDescription: 'Park yenilendi',
  categoryId: 'gundem',
  categoryConfidence: 80,
  isBreaking: false,
  city: null,
  district: null,
  country: 'Türkiye',
  tags: [],
} as AiRewriteResult

describe('factChecker editor lean path', () => {
  it('heuristicOnly does not call DeepSeek', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    const result = await factChecker.check(
      {
        sourceLabel: 'AA',
        sourceUrl: 'https://aa.test/park',
        originalTitle: 'Belediye parkı yeniledi',
        originalSummary: 'Çanakkale Belediyesi sahil parkını yeniledi.',
        originalContent: 'Çanakkale Belediyesi sahil parkını yeniledi. Çalışma 3 günde bitti.',
        rewritten,
      },
      { heuristicOnly: true }
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.flags).toContain('factcheck_heuristic')
    fetchSpy.mockRestore()
  })
})
