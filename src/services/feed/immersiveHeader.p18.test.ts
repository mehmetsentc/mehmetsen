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
  it('uses overlay chrome + glass tokens, not an opaque brand slab class on the immersive header', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    const css = read('src/app/globals.css')
    expect(nav).toContain('mobile-top-chrome--immersive')
    expect(nav).not.toContain('bg-[rgb(var(--header-brand-bg))]')
    expect(css).toContain('.mobile-top-chrome--immersive')
    expect(css).toContain('background-color: rgb(8 12 18 / 0.96)')
    expect(css).toContain('2.75rem +')
    expect(css).toContain('backdrop-filter')
    expect(css).toContain("[data-header-bleed='1'] .content-main-newspaper")
    expect(css).toMatch(
      /\.content-main-reels[\s\S]{0,500}--feed-card-h:\s*calc\(100svh - var\(--mobile-top-chrome-offset/
    )
  })

  it('hosts a compact Ana Sayfa/Akış surface toggle and icon actions — no destination row', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    const more = read('src/components/layout/HeaderMoreMenu.tsx')
    const css = read('src/app/globals.css')
    expect(nav).toContain('header-surface-toggle')
    expect(nav).toContain('data-active')
    expect(nav).toContain('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]')
    expect(nav).toContain('justify-self-center')
    expect(css).toContain('width: 8.75rem')
    expect(css).toContain('grid-template-columns: 1fr 1fr')
    expect(css).toContain(".header-surface-toggle[data-active='akis']::before")
    expect(nav).toContain('aria-label="Ana Sayfa"')
    expect(nav).toContain('aria-label="Akış"')
    expect(nav).toContain('aria-label="Ara"')
    expect(nav).toContain('HeaderMoreMenu')
    expect(more).toContain('header-nav-more')
    expect(nav).toContain('useSearchParams')
    expect(nav).toContain('resolveSharedCategoryId')
    expect(nav).toContain('header-nav-ana-sayfa')
    expect(nav).toContain('header-nav-akis')
    expect(nav).toContain('header-nav-ara')
    expect(more).toContain('header-nav-profil')
    expect(more).toContain('ROUTES.NOTIFICATIONS')
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

  it('keeps existing profile destination (no new identity fetch)', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    expect(nav).toContain('ROUTES.PROFILE(user.username || user.uid)')
    expect(nav).not.toContain('publisher-studio/mine')
    expect(nav).not.toContain('listPublishersForUser')
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
