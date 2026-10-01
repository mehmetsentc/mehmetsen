import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CATEGORY_FIRST_PAGE_CACHE_KEY,
  CATEGORY_FIRST_PAGE_REVALIDATE_S,
} from '@/services/categoryFirstPage.server'

describe('FINOPS-EMERGENCY-002 category first-page shared cache', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/app/(main)/kategori/[id]/page.tsx'),
    'utf8'
  )
  const svc = readFileSync(
    join(process.cwd(), 'src/services/categoryFirstPage.server.ts'),
    'utf8'
  )
  const revalidate = readFileSync(join(process.cwd(), 'src/lib/revalidateHome.ts'), 'utf8')

  it('uses a 30–60s public cache keyed by category, not auth/social', () => {
    expect(CATEGORY_FIRST_PAGE_REVALIDATE_S).toBeGreaterThanOrEqual(30)
    expect(CATEGORY_FIRST_PAGE_REVALIDATE_S).toBeLessThanOrEqual(60)
    expect(CATEGORY_FIRST_PAGE_CACHE_KEY).toBe('category-first-page-v1')
    expect(svc).toContain('unstable_cache')
    expect(svc).toContain("tags: ['category-feed']")
    expect(svc).toContain('fetchCategoryFirstPage')
    expect(svc).not.toContain('getClientAuthToken')
    expect(svc).not.toContain('verifyFirebaseIdToken')
    expect(svc).not.toContain('userId')
  })

  it('collapses generateMetadata + page onto one request-scoped loader', () => {
    expect(page).toContain("from '@/services/categoryFirstPage.server'")
    expect(page.match(/prefetchCategoryPosts\(/g)?.length).toBe(2)
    expect(page).toContain('generateMetadata')
    expect(svc).toContain('cache(async (categoryId: string)')
    expect(page).not.toContain("getAdminFirestore()")
    expect(page).not.toContain("Collections.NEWS")
  })

  it('keeps first-window limits and isolates breaking vs category queries', () => {
    expect(svc).toContain(".limit(20)")
    expect(svc).toContain(".limit(40)")
    expect(svc).toContain("categoryId === 'son-dakika'")
    expect(svc).toContain("where('isBreaking', '==', true)")
    expect(svc).toContain('getHomeFeedCategoryFamily')
  })

  it('invalidates with existing publish tag', () => {
    expect(revalidate).toContain("revalidateTag('category-feed')")
  })

  it('does not cache city-host category (already city-news 120s)', () => {
    const cityPage = readFileSync(
      join(process.cwd(), 'src/app/city-site/kategori/[id]/page.tsx'),
      'utf8'
    )
    expect(cityPage).toContain('getCityCategoryFeedInitialData')
    expect(page).not.toContain('getCitySlugFromHeaders')
    expect(svc).not.toContain('getCitySlugFromHeaders')
  })
})
