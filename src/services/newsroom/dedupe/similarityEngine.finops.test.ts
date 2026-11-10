import { describe, expect, it, vi } from 'vitest'
import { findSimilarPublishedArticle } from './similarityEngine'

function fakeDb(selectCalls: string[][]) {
  const q: any = {
    where: () => q,
    orderBy: () => q,
    limit: () => q,
    select: (...f: string[]) => {
      selectCalls.push(f)
      return q
    },
    get: vi.fn(async () => ({ docs: [{ id: 'n1', data: () => ({ title: 'Ankara’da deprem', description: 'Ankara’da 4,2 büyüklüğünde deprem' }) }] })),
  }
  return { collection: () => q } as any
}

describe('FinOps 10 Nov: dedupe reads only the compared fields', () => {
  it('projects title/description/summary on both the news and draft queries', async () => {
    const calls: string[][] = []
    await findSimilarPublishedArticle(fakeDb(calls), 'x', 'y')
    expect(calls).toHaveLength(2)
    for (const c of calls) expect(c).toEqual(['title', 'description', 'summary'])
  })

  it('still finds a near-identical article', async () => {
    const match = await findSimilarPublishedArticle(fakeDb([]), 'Ankara’da deprem', 'Ankara’da 4,2 büyüklüğünde deprem')
    expect(match?.newsId).toBe('n1')
  })
})
