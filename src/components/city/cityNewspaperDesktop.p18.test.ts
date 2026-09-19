import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('city desktop newspaper split', () => {
  it('city home renders newspaper RSC on desktop and a mobile Feed 2 island', () => {
    const home = read('src/app/city-site/page.tsx')
    const adaptive = read('src/components/city/CityAdaptiveHome.tsx')
    expect(home).toContain('CityAdaptiveHome')
    expect(home).not.toContain('CitySmartFeedPage')
    expect(adaptive).toContain('CityDesktopNewspaperRsc')
    expect(adaptive).not.toContain('CityMobileHomeIsland')
    expect(adaptive).not.toContain('SmartFeedClient')
    expect(adaptive).toContain('hidden lg:block')
    const layout = read('src/components/city/CityLayoutClient.tsx')
    expect(layout).toContain('CityMobileFeedSlot')
  })

  it('hides overlay city chrome on desktop so newspaper header is visible', () => {
    const layout = read('src/components/city/CityLayoutClient.tsx')
    expect(layout).toContain('CityDesktopNewspaperHeader')
    expect(layout).toMatch(/lg:hidden[\s\S]{0,80}CityNavbar/)
    expect(layout).toContain('data-city-desktop="1"')
    expect(layout).toContain('content-stage-newspaper')
    expect(layout).toContain('lg:hidden max-lg:fixed')
  })

  it('keeps homepage and category pages on the same newspaper column', () => {
    const layout = read('src/components/city/CityLayoutClient.tsx')
    const rsc = read('src/components/city/CityDesktopNewspaperRsc.tsx')
    const header = read('src/components/city/CityDesktopNewspaperHeader.tsx')
    expect(layout).toContain('content-main-newspaper')
    expect(rsc).not.toContain('content-stage-newspaper')
    expect(header).toContain('city-masthead-lockup')
    expect(header).not.toContain('formatNewsDateLong')
  })

  it('city-site category pages do not import HomeFeed or SmartFeed', () => {
    const kategori = read('src/app/city-site/kategori/[id]/page.tsx')
    const mainKategori = read('src/app/(main)/kategori/[id]/page.tsx')
    expect(mainKategori).toContain('CityNewspaperCategoryPage')
    expect(mainKategori).not.toContain('CityFeedPageClient')
    const categoryPage = read('src/components/city/CityNewspaperCategoryPage.tsx')
    expect(kategori).toContain('CityNewspaperCategoryPage')
    expect(kategori).not.toContain('CityFeedPageClient')
    expect(categoryPage).not.toContain("from '@/components/home/HomeFeed'")
    expect(categoryPage).not.toContain('SmartFeedClient')
  })

  it('newspaper nav slugs resolve to city category pages', async () => {
    const { CITY_NEWSPAPER_NAV } = await import('@/lib/cityNewspaperNav')
    const { resolveCityCategoryRoute } = await import('@/lib/cityCategoryRoute')
    for (const item of CITY_NEWSPAPER_NAV) {
      if (item.href === '/') continue
      const slug = item.href.replace('/kategori/', '')
      expect(resolveCityCategoryRoute(slug), item.href).not.toBeNull()
    }
  })
})
