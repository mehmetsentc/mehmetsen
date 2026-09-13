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
    expect(css).toContain('backdrop-filter')
    expect(css).toContain("[data-header-bleed='1'] .content-main-newspaper")
    expect(css).toMatch(
      /\.content-main-reels[\s\S]{0,500}--feed-card-h:\s*calc\(100svh - var\(--mobile-top-chrome-offset/
    )
  })

  it('primary destinations are Ana Sayfa / Akış / Ara / Profil', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    expect(nav).toContain('aria-label="Ana Sayfa"')
    expect(nav).toContain('aria-label="Akış"')
    expect(nav).toContain('aria-label="Ara"')
    expect(nav).toContain('aria-label="Profil"')
    expect(nav).toContain('header-nav-ana-sayfa')
    expect(nav).toContain('header-nav-akis')
    expect(nav).toContain('header-nav-ara')
    expect(nav).toContain('header-nav-profil')
    expect(nav).not.toContain('Feed 2')
    expect(nav).not.toContain('Feed V2')
    expect(nav).not.toContain('Ana Feed')
    expect(nav).not.toContain('Akıllı Akış')
  })

  it('restores + via SubmitNewsModal and Messages via NavMessagesBadge', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    expect(nav).toContain('SubmitNewsModal')
    expect(nav).toContain('header-action-plus')
    expect(nav).toContain('aria-label="Haber Ekle"')
    expect(nav).toContain('header-action-messages')
    expect(nav).toContain('aria-label="Mesajlar"')
    expect(nav).toContain('ROUTES.MESSAGES')
    expect(nav).toContain('NavMessagesBadge')
    expect(nav).toContain('actionBtn')
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
  })
})
