import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('P1-E tag list query', () => {
  const news = readFileSync(
    join(process.cwd(), 'src/services/newsService.server.ts'),
    'utf8'
  )
  const start = news.indexOf('const TAG_LIST_LIMIT')
  const end = news.indexOf('function publicAuthorFromSeedEditor')
  const block = news.slice(start, end)

  it('uses one projected array-contains-any read, cached 24h on news-post', () => {
    expect(block).toContain("'array-contains-any'")
    expect(block).not.toContain("'array-contains'")
    expect(block).not.toContain('Promise.allSettled')
    expect(block).toContain('limit(TAG_LIST_LIMIT)')
    expect(block).toContain('TAG_LIST_LIMIT = 20')
    expect(block).toContain('selectNewsCardFields')
    expect(block).toContain('revalidate: 60 * 60 * 24')
    expect(block).toContain("tags: ['news-post']")
  })
})
