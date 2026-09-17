/**
 * Global Navigation V2 — header + drawer + Pinterest bottom dock.
 * AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isGlobalNavV2Active,
  resolveMobileNavVisible,
  resolveTopNavbarVisible,
  resolveSiteChromeVisible,
} from '@/lib/feed/reader/shellChrome'
import { isGlobalNavV2EnabledClient } from '@/lib/feed/featureFlagClient'

describe('Global Nav V2', () => {
  it('flag defaults ON; Pinterest dock visible except reels, reader, admin', () => {
    expect(isGlobalNavV2EnabledClient()).toBe(true)
    expect(isGlobalNavV2Active()).toBe(true)
    expect(resolveMobileNavVisible({ pathname: '/' })).toBe(true)
    expect(resolveMobileNavVisible({ pathname: '/feed' })).toBe(true)
    expect(resolveMobileNavVisible({ pathname: '/feed-v2' })).toBe(true)
    expect(resolveMobileNavVisible({ pathname: '/haber/x' })).toBe(true)
    expect(resolveMobileNavVisible({ pathname: '/search' })).toBe(true)
    expect(resolveMobileNavVisible({ pathname: '/reels' })).toBe(false)
    expect(
      resolveMobileNavVisible({ pathname: '/feed-v2', readerSurfaceActive: true })
    ).toBe(false)
    expect(resolveMobileNavVisible({ pathname: '/admin' })).toBe(false)
  })

  it('top Navbar stays mounted on Feed V2 during Reader (spacer-stable); paint via CSS', () => {
    expect(resolveTopNavbarVisible({ pathname: '/', readerSurfaceActive: false })).toBe(true)
    expect(resolveTopNavbarVisible({ pathname: '/feed', readerSurfaceActive: false })).toBe(true)
    expect(
      resolveTopNavbarVisible({ pathname: '/feed-v2', readerSurfaceActive: false })
    ).toBe(true)
    // Keep mounted so mobile-chrome-spacer does not collapse (~112px jump).
    expect(
      resolveTopNavbarVisible({ pathname: '/feed-v2', readerSurfaceActive: true })
    ).toBe(true)
    expect(resolveSiteChromeVisible({ pathname: '/feed-v2', readerSurfaceActive: false })).toBe(
      true
    )
    // Painted/interactive chrome still off while Reader owns the surface.
    expect(resolveSiteChromeVisible({ pathname: '/feed-v2', readerSurfaceActive: true })).toBe(
      false
    )
  })

  it('header + sidebar labels; Pinterest dock hosts Ana Sayfa / Akış / Profil', () => {
    const mobileNav = readFileSync(
      join(process.cwd(), 'src/components/layout/MobileNav.tsx'),
      'utf8'
    )
    expect(mobileNav).toContain('Zap')
    expect(mobileNav).toContain('hrefForNewsSurface')
    expect(mobileNav).toContain('header-nav-ana-sayfa')
    expect(mobileNav).toContain('header-nav-akis')
    expect(mobileNav).toContain('header-nav-profil')
    const sidebar = readFileSync(
      join(process.cwd(), 'src/components/layout/Sidebar.tsx'),
      'utf8'
    )
    expect(sidebar).toContain('global-nav-v2-primary')
    expect(sidebar).toContain('global-nav-ana-feed')
    expect(sidebar).toContain('global-nav-feed-v2')
    expect(sidebar).toContain('<Zap ')
    expect(sidebar).toContain('<Home ')
    expect(sidebar).toContain('aria-label="Ana Sayfa"')
    expect(sidebar).toContain('>Akış</span>')
    expect(sidebar).not.toContain('Ana Feed')
    expect(sidebar).not.toContain('Akıllı Akış')
    expect(sidebar).not.toMatch(/>\s*Feed 2\s*</)
    expect(sidebar).toContain('aria-label="Ara"')
    expect(sidebar).toContain('aria-label="Bildirimler"')
    expect(sidebar).toContain('aria-label="Profil"')
    expect(sidebar).toContain('clearFeedRestore')
    const layout = readFileSync(
      join(process.cwd(), 'src/components/layout/MainLayoutClient.tsx'),
      'utf8'
    )
    expect(layout).toContain('data-global-nav-v2')
    expect(layout).toContain('showMobileNav')
    expect(layout).toContain('resolveMobileNavVisible')
    const navbar = readFileSync(
      join(process.cwd(), 'src/components/layout/Navbar.tsx'),
      'utf8'
    )
    expect(navbar).toContain('Menüyü aç')
    expect(navbar).not.toContain('header-nav-ana-sayfa')
    expect(navbar).not.toContain('header-nav-akis')
    expect(navbar).toContain('header-nav-ara')
    expect(navbar).toContain('header-action-plus')
    expect(navbar).not.toMatch(/>\s*Feed 2\s*</)
    expect(navbar).not.toMatch(/>\s*Feed V2\s*</)
    expect(navbar).not.toContain('Ana Feed')
    expect(navbar).not.toContain('Akıllı Akış')
    const back = readFileSync(
      join(process.cwd(), 'src/components/layout/BackNavButton.tsx'),
      'utf8'
    )
    expect(back).toContain('isGlobalNavV2EnabledClient')
    expect(back).toContain('if (globalNavV2 && isFeedV2) return null')
  })

  it('CSS keeps bottom-nav clearance on mobile; Feed V2 cards reserve the pill', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toContain("[data-global-nav-v2='1'] .content-main:not(.content-main-reels)")
    expect(css).toContain('--mobile-nav-clearance')
    const chrome = readFileSync(
      join(process.cwd(), 'src/lib/feed/reader/feedChrome.ts'),
      'utf8'
    )
    expect(chrome).toContain('safe-area-inset-bottom')
    expect(chrome).toContain('mobile-nav-pill-h')
  })

  it('does not touch Reader ownership history helpers', () => {
    const history = readFileSync(
      join(process.cwd(), 'src/lib/feed/reader/history.ts'),
      'utf8'
    )
    expect(history).toContain('resolveFeedOwnerHistorySync')
    expect(history).toContain('foreignPopDuringClose')
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toContain('foreignPopDuringCloseRef')
    expect(reader).toContain('armFeedOwnerRescue')
  })

  it('FullscreenNewsCard structure preserved (no nav redesign of cards)', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('smart-feed-read-cta')
    expect(card).toContain('smart-feed-publisher-row')
    expect(card).toContain('SwipeDiscoveryCoach')
  })
})
