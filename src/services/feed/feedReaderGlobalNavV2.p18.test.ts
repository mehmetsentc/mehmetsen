/**
 * Global Navigation V2 — remove bottom MobileNav; header + side drawer authority.
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
  it('flag defaults ON; MobileNav never visible', () => {
    expect(isGlobalNavV2EnabledClient()).toBe(true)
    expect(isGlobalNavV2Active()).toBe(true)
    expect(resolveMobileNavVisible({ pathname: '/' })).toBe(false)
    expect(resolveMobileNavVisible({ pathname: '/feed' })).toBe(false)
    expect(resolveMobileNavVisible({ pathname: '/feed-v2' })).toBe(false)
    expect(resolveMobileNavVisible({ pathname: '/haber/x' })).toBe(false)
    expect(resolveMobileNavVisible({ pathname: '/search' })).toBe(false)
  })

  it('top Navbar on Ana Feed + Feed V2; hidden while Reader open on Feed V2', () => {
    expect(resolveTopNavbarVisible({ pathname: '/', readerSurfaceActive: false })).toBe(true)
    expect(resolveTopNavbarVisible({ pathname: '/feed', readerSurfaceActive: false })).toBe(true)
    expect(
      resolveTopNavbarVisible({ pathname: '/feed-v2', readerSurfaceActive: false })
    ).toBe(true)
    expect(
      resolveTopNavbarVisible({ pathname: '/feed-v2', readerSurfaceActive: true })
    ).toBe(false)
    expect(resolveSiteChromeVisible({ pathname: '/feed-v2', readerSurfaceActive: false })).toBe(
      true
    )
    expect(resolveSiteChromeVisible({ pathname: '/feed-v2', readerSurfaceActive: true })).toBe(
      false
    )
  })

  it('reuses Home + Zap Feed V2 icons; side nav primary destinations; no MobileNav mount when gated', () => {
    const mobileNav = readFileSync(
      join(process.cwd(), 'src/components/layout/MobileNav.tsx'),
      'utf8'
    )
    expect(mobileNav).toContain('Zap')
    expect(mobileNav).toContain('ROUTES.FEED_V2')
    const sidebar = readFileSync(
      join(process.cwd(), 'src/components/layout/Sidebar.tsx'),
      'utf8'
    )
    expect(sidebar).toContain('global-nav-v2-primary')
    expect(sidebar).toContain('global-nav-ana-feed')
    expect(sidebar).toContain('global-nav-feed-v2')
    expect(sidebar).toContain('<Zap ')
    expect(sidebar).toContain('<Home ')
    expect(sidebar).toContain('aria-label="Ana Feed"')
    expect(sidebar).toContain('Akıllı Akış')
    expect(sidebar).not.toMatch(/>\s*Feed 2\s*</)
    expect(sidebar).toContain('aria-label="Arama"')
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
    expect(navbar).toContain('header-nav-ana-feed')
    expect(navbar).toContain('header-nav-feed-v2')
    expect(navbar).toContain('<Home ')
    expect(navbar).toContain('<Zap ')
    expect(navbar).not.toMatch(/>\s*Feed 2\s*</)
    const back = readFileSync(
      join(process.cwd(), 'src/components/layout/BackNavButton.tsx'),
      'utf8'
    )
    expect(back).toContain('isGlobalNavV2EnabledClient')
    expect(back).toContain('if (globalNavV2 && isFeedV2) return null')
  })

  it('CSS removes bottom-nav layout footprint under Global Nav V2; safe-area retained', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toContain("[data-global-nav-v2='1'] .content-main:not(.content-main-reels)")
    expect(css).toContain('env(safe-area-inset-bottom')
    const chrome = readFileSync(
      join(process.cwd(), 'src/lib/feed/reader/feedChrome.ts'),
      'utf8'
    )
    expect(chrome).toContain('safe-area-inset-bottom')
    expect(chrome).not.toContain('mobile-nav-pill-h')
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
