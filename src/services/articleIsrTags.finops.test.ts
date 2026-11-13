import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// FinOps 13 Nov: caches read during the /haber render attach their tags and
// revalidate to the ISR page. None may carry the pipeline-busted 'news-post' tag
// or a revalidate shorter than an hour.
const svc = readFileSync('src/services/newsService.server.ts', 'utf8')
const canon = readFileSync('src/lib/canonical/canonicalEligibility.ts', 'utf8')

function block(src: string, key: string): string {
  const i = src.indexOf(key)
  expect(i).toBeGreaterThan(-1)
  // From the cache key to the end of its options object, comments stripped.
  const end = src.indexOf('}\n)', i)
  return src.slice(i, end + 1).replace(/\/\/.*$/gm, '')
}

describe('article ISR page is not invalidated by every publish', () => {
  it('related posts cache has its own tag and a 6h revalidate', () => {
    const b = block(svc, "['suggested-posts-v3']")
    expect(b).toContain("tags: ['suggested-posts']")
    expect(b).toContain('revalidate: 6 * 60 * 60')
    expect(b).not.toContain("'news-post'")
  })

  it('article-by-slug cache lives 24h and is dropped only by its own news:{slug} tag', () => {
    const b = block(svc, "['news-by-slug-v1', normalized]")
    expect(b).toContain('revalidate: 86400')
    expect(b).toContain('tags: [`news:${normalized}`]')
  })

  it('canonical-by-slug lookup no longer carries news-post or a 60 s revalidate', () => {
    const b = block(canon, "['canonical-news-by-slug-v2']")
    expect(b).toContain("tags: ['canonical-news']")
    expect(b).toContain('revalidate: 3600')
    expect(b).not.toContain("'news-post'")
  })
})

describe('article load does not nest the pipeline-tagged legacy cache', () => {
  it('loadNewsBySlug reads Firestore through the uncached loader', () => {
    const i = svc.indexOf('async function loadNewsBySlug')
    const body = svc.slice(i, svc.indexOf('export async function getNewsBySlug', i))
    expect(body).toContain('loadLegacyNewsBySlug(decoded)')
    expect(body).not.toContain('getLegacyNewsBySlugCached(')
  })
})
