/**
 * Phase 1A — shared ContextRail visual contracts. AUTOMATED.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('immersive ContextRail Phase 1A', () => {
  it('CategoryNav and FeedV2CategoryNav share ContextRail chip classes', () => {
    const rail = read('src/components/layout/ContextRail.tsx')
    const home = read('src/components/layout/CategoryNav.tsx')
    const akis = read('src/components/feed/smart/FeedV2CategoryNav.tsx')
    const modes = read('src/components/feed/smart/FeedModeNav.tsx')
    expect(rail).toContain('CONTEXT_RAIL_CHIP_ACTIVE')
    expect(rail).toContain('context-rail__chip--active')
    expect(rail).toContain('CONTEXT_RAIL_CHIP_IDLE')
    expect(home).toContain('contextRailChipClass')
    expect(home).toContain("from '@/components/layout/ContextRail'")
    expect(akis).toContain('contextRailChipClass')
    expect(akis).toContain("from '@/components/layout/ContextRail'")
    expect(modes).toContain('contextRailChipClass')
    expect(home).not.toContain('min-h-[48px]')
    expect(akis).not.toContain('bg-black/45')
    expect(home).not.toContain('bg-black/45')
  })

  it('Navbar hosts a shared rail slot on Akış and CategoryNav elsewhere', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    expect(nav).toContain('ContextRailSlot')
    expect(nav).toContain('isFeedV2')
    expect(nav).toContain('<CategoryNav embedded />')
    expect(nav).toContain('--nahaber-context-rail-height')
    const layout = read('src/components/layout/MainLayoutClient.tsx')
    expect(layout).toContain('ContextRailSlotProvider')
  })

  it('Ana Sayfa and Akış consume the same canonical swipe destinations', () => {
    const home = read('src/components/layout/CategoryNav.tsx')
    const akis = read('src/components/feed/smart/FeedV2CategoryNav.tsx')
    const helper = read('src/lib/feed/sharedCategoryRail.ts')
    expect(home).toContain('getSharedRailDestinations')
    expect(home).toContain('href={cat.href}')
    expect(akis).toContain('getSharedRailDestinations')
    expect(akis).toContain('onChange(item.tab)')
    expect(akis).not.toContain("/api/feed/v2/tabs")
    expect(helper).toContain('getSwipeableFeedDestinations')
    expect(helper).toContain("SHARED_RAIL_ALL_ID ? 'Tümü'")
  })

  it('does not introduce a second taxonomy or duplicate nav family', () => {
    const home = read('src/components/layout/CategoryNav.tsx')
    expect(home).not.toContain('HomeCategoryNavV2')
    expect(home).not.toContain('PinterestCategoryBar')
    const akis = read('src/components/feed/smart/FeedV2CategoryNav.tsx')
    expect(akis).toContain('createPortal')
    expect(akis).toContain('FeedV2ExitButton')
    expect(akis).toContain('useContextRailSlot')
    expect(akis).toContain('compact')
  })
})

describe('article TOC non-overlap', () => {
  it('desktop TOC is a layout rail, not a fixed overlay on the article', () => {
    const toc = read('src/components/news/ArticleTOC.tsx')
    const css = read('src/app/globals.css')
    const articlePage = read('src/components/news/NewsArticlePage.tsx')
    const articleStatic = read('src/components/news/NewsArticleStatic.tsx')
    const interactive = read('src/components/news/NewsArticleInteractive.tsx')
    expect(toc).toContain('article-toc-rail')
    expect(toc).not.toContain('fixed right-6')
    expect(css).toContain('.article-toc-rail')
    expect(css).toContain('grid-template-columns: minmax(0, var(--article-measure)) 15.5rem')
    expect(css).toContain('@container nahaber-article')
    expect(articlePage).toContain('nahaber-article-frame')
    expect(articleStatic).toContain('ArticleTOC')
    expect(interactive).not.toContain('<ArticleTOC')
  })
})
