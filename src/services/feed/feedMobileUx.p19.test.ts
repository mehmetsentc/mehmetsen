/**
 * P19 — Global Nav red/transparent + MobileNav V2 hide + typewriter + /haber reader skin.
 * AUTOMATED — NOT HUMAN GO / NOT deploy.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ARTICLE_READER_SHELL_CLASS,
  ARTICLE_READER_SHELL_TESTID,
  FEED_READER_CSS_VARS,
} from '@/lib/feed/reader/articleReaderPresentation'
import { resolveMobileNavVisible, isGlobalNavV2Active } from '@/lib/feed/reader/shellChrome'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('P19 Global Nav', () => {
  it('selected icon is brand red on transparent; idle is soft transparent', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    expect(nav).toContain("text-[rgb(var(--brand-500))]")
    expect(nav).toContain('text-[rgb(var(--header-onbrand))]')
    expect(nav).not.toContain('text-white/45')
    expect(nav).not.toContain("bg-white/20 text-white")
    expect(nav).toContain('global-nav-v2-icon-row')
    expect(nav).toContain('h-12 w-12')
  })

  it('Global Nav V2 keeps bottom MobileNav dock (hidden only on reels/reader/admin)', () => {
    expect(isGlobalNavV2Active()).toBe(true)
    expect(resolveMobileNavVisible({ pathname: '/feed-v2' })).toBe(true)
    expect(resolveMobileNavVisible({ pathname: '/' })).toBe(true)
    expect(resolveMobileNavVisible({ pathname: '/reels' })).toBe(false)
    expect(
      resolveMobileNavVisible({ pathname: '/feed-v2', readerSurfaceActive: true })
    ).toBe(false)
    const css = read('src/app/globals.css')
    expect(css).not.toContain("[data-global-nav-v2='1'] .mobile-bottom-nav")
  })
})

describe('P19 typewriter', () => {
  it('starts empty when active; reduced-motion uses reveal path', () => {
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    expect(card).toContain("useState(() => (isActive ? '' : item.headline))")
    expect(card).toContain('headlineReveal')
    expect(card).toContain('prefers-reduced-motion: reduce')
    expect(card).toContain('data-feed-typewriter')
    expect(card).toContain('setHeadlineReveal(false)')
  })
})

describe('P19 /haber Feed V2 reader skin + recommendations', () => {
  it('shared presentation tokens exist', () => {
    expect(ARTICLE_READER_SHELL_CLASS).toBe('article-reader-shell')
    expect(ARTICLE_READER_SHELL_TESTID).toBe('article-reader-shell')
    expect(FEED_READER_CSS_VARS['--reader-page-bg']).toBe('#0c0c0e')
    expect(FEED_READER_CSS_VARS['--reader-accent']).toBe('#e11d2e')
  })

  it('NewsArticleStatic mounts reader shell + HaberEndRecommendations', () => {
    const staticArticle = read('src/components/news/NewsArticleStatic.tsx')
    expect(staticArticle).toContain('ARTICLE_READER_SHELL_CLASS')
    expect(staticArticle).toContain('HaberEndRecommendations')
    expect(staticArticle).toContain('ARTICLE_READER_HEADLINE_CLASS')
    expect(staticArticle).not.toContain('ArticleRelatedGridStatic posts={relatedPosts}')
  })

  it('HaberEndRecommendations uses reader rail with related fallback', () => {
    const recs = read('src/components/news/HaberEndRecommendations.tsx')
    expect(recs).toContain('variant="reader"')
    expect(recs).toContain('fallback={fallback}')
    expect(recs).toContain('ArticleRelatedGridStatic')
    expect(recs).not.toContain('onOpenArticle')
  })

  it('FeedDiscoveryRail supports fallback; reader visual markers preserved', () => {
    const rail = read('src/components/feed/smart/FeedDiscoveryRail.tsx')
    expect(rail).toContain('fallback')
    expect(rail).toContain('data-reader-rec-layout="editorial-stack"')
    expect(rail).toContain('Bu konuda daha fazlası')
    expect(rail).toContain('aspect-[16/9]')
  })

  it('FeedArticleReader shares article-reader-shell class', () => {
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain('ARTICLE_READER_SHELL_CLASS')
    expect(reader).toContain('data-article-reader-skin="feed-v2"')
  })
})
