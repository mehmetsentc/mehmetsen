import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// FinOps 17 Nov (A6): old article pages must not inherit the 30-min / 6h revalidate
// of the side-list caches; they read in-process copies instead.
const page = readFileSync('src/app/(main)/haber/[slug]/page.tsx', 'utf8')
const svc = readFileSync('src/services/newsService.server.ts', 'utf8')
const loader = readFileSync('src/lib/sitemap/newsSitemapLoader.ts', 'utf8')

describe('A6: old articles do not re-render every 30 minutes', () => {
  it('page keeps a 24h revalidate and flags stories older than 3 days', () => {
    expect(page).toContain('export const revalidate = 86400')
    expect(page).toContain('OLD_ARTICLE_AGE_MS = 3 * 24 * 60 * 60 * 1000')
    expect(page).toContain('preferMemo: isOldArticle')
    expect(page).toContain('maxMemoAgeMs: OLD_ARTICLE_SIDE_LIST_MEMO_MS')
  })

  it('news sitemap memo never goes below its 10-min floor and is opt-in for longer', () => {
    expect(loader).toContain('Math.max(NEWS_SITEMAP_MEMO_MS, options?.maxMemoAgeMs ?? 0)')
  })

  it('related posts memo is bounded and only stores non-empty lists', () => {
    const i = svc.indexOf('async function getSuggestedPostsMemo')
    const body = svc.slice(i, svc.indexOf('export async function getSuggestedPostsServer', i))
    expect(body).toContain('SUGGESTED_MEMO_MAX')
    expect(body).toContain('if (value.length > 0)')
    expect(body).toContain('getSuggestedPostsCached(categoryId, citySlug, fetchLimit)')
  })
})
