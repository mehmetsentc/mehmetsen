/**
 * Phase 1 immersive header — source contracts. AUTOMATED.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('immersive header Phase 1', () => {
  it('uses opaque Pinterest chrome so stories cannot paint through the header', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    const css = read('src/app/globals.css')
    expect(nav).toContain('mobile-top-chrome--immersive')
    expect(nav).toContain('mobile-top-chrome--overlay')
    expect(nav).toContain('data-feed-overlay-chrome')
    expect(nav).not.toContain('bg-[rgb(var(--header-brand-bg))]')
    expect(css).toContain('.mobile-top-chrome--immersive')
    expect(css).toContain('--nahaber-header-row-height')
    expect(nav).toContain('--nahaber-header-row-height')
    const immersive = css.slice(css.indexOf('.mobile-top-chrome--immersive'))
    expect(immersive.slice(0, 420)).toContain('rgb(var(--header-brand-bg))')
    expect(immersive.slice(0, 420)).not.toContain('background-color: transparent')
    expect(css).toContain("[data-header-bleed='1'] .content-main-newspaper")
    expect(css).toMatch(
      /\.content-main-reels[\s\S]{0,500}--feed-card-h:\s*calc\(100dvh - var\(--mobile-top-chrome-offset/
    )
  })

  it('keeps search/plus/more in the header; Ana Sayfa, Akış, Profil live in the bottom dock', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    const more = read('src/components/layout/HeaderMoreMenu.tsx')
    const dock = read('src/components/layout/MobileNav.tsx')
    expect(nav).not.toContain('header-surface-toggle')
    expect(nav).not.toContain('header-nav-ana-sayfa')
    expect(nav).not.toContain('header-nav-akis')
    expect(nav).toContain('aria-label="Ara"')
    expect(nav).toContain('header-nav-ara')
    expect(nav).toContain('header-action-plus')
    expect(nav).toContain('HeaderMoreMenu')
    expect(nav).toContain('justify-between')
    expect(more).toContain('header-nav-more')
    expect(more).not.toContain('header-nav-profil')
    expect(more).toContain('ROUTES.NOTIFICATIONS')
    expect(dock).toContain('header-nav-ana-sayfa')
    expect(dock).toContain('header-nav-akis')
    expect(dock).toContain('header-nav-profil')
    expect(dock).toContain("label: 'Ana Sayfa'")
    expect(dock).toContain("label: 'Akış'")
    expect(dock).toContain("label: 'Profilim'")
    expect(dock).toContain("label: 'Ara'")
    expect(dock).toContain('hrefForNewsSurface')
    expect(nav).not.toContain('NotificationBell')
    expect(nav).not.toContain('header-dest-nav')
    expect(nav).not.toContain('Feed 2')
    expect(nav).not.toContain('Feed V2')
    expect(nav).not.toContain('Ana Feed')
    expect(nav).not.toContain('Akıllı Akış')
  })

  it('restores + via SubmitNewsModal and Messages via NavMessagesBadge', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    const more = read('src/components/layout/HeaderMoreMenu.tsx')
    expect(nav).toContain('SubmitNewsModal')
    expect(more).toContain('header-action-plus')
    expect(more).toContain('aria-label="Haber Ekle"')
    expect(more).toContain('header-action-messages')
    expect(more).toContain('aria-label="Mesajlar"')
    expect(more).toContain('ROUTES.MESSAGES')
    expect(more).toContain('NavMessagesBadge')
  })

  it('does not show Back on primary destinations', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    expect(nav).toContain('isPrimaryDest')
    expect(nav).toMatch(/showBack\s*=\s*\n?\s*!isPrimaryDest/)
  })

  it('keeps Profilim on the dock for the signed-in reader', () => {
    const dock = read('src/components/layout/MobileNav.tsx')
    expect(dock).toContain("label: 'Profilim'")
    expect(dock).toContain('header-nav-profil')
    expect(dock).toContain('ROUTES.PROFILE(username)')
    expect(dock).toContain("label: 'Ara'")
    expect(dock).not.toContain('listPublishersForUser')
  })

  it('does not remount MobileNav and does not touch Reader/SmartFeed ranking files', () => {
    const layout = read('src/components/layout/MainLayoutClient.tsx')
    expect(layout).toContain('resolveMobileNavVisible')
    expect(layout).toContain('showMobileNav')
    expect(layout).toContain('data-header-bleed')
    const nav = read('src/components/layout/Navbar.tsx')
    expect(nav).toContain('--mobile-top-chrome-offset')
    expect(nav).toContain('ContextRailSlot')
    expect(nav).toContain('mobile-chrome-spacer')
    expect(nav).not.toContain('after:inset-[-8px]')
    expect(nav).not.toContain('header-dest-nav')
  })
})
