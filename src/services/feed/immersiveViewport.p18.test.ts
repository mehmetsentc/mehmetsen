/**
 * Mobile chrome / viewport geometry contracts. AUTOMATED.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('immersive mobile viewport geometry', () => {
  it('chrome authority uses painted bottom, not a magic spacer', () => {
    const hook = read('src/hooks/useChromeOffset.ts')
    const nav = read('src/components/layout/Navbar.tsx')
    expect(hook).toContain('getBoundingClientRect()')
    expect(hook).toContain('box.bottom')
    expect(nav).toContain('mobile-chrome-spacer')
    expect(nav).toContain('fallbackChromeHeight')
    expect(nav).not.toMatch(/padding-top:\s*116px/)
    expect(nav).not.toMatch(/margin-top:\s*140px/)
  })

  it('Akış hero flexes leftover height; copy/footer stay shrink-wrapped', () => {
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    expect(card).toContain('data-feed-hero-flex="1"')
    expect(card).toContain('min-h-[var(--feed-v2-hero-min)]')
    expect(card).toContain('smart-feed-action-zone')
    expect(card).toContain('smart-feed-publisher-row')
    expect(card).not.toContain('aspect-[4/3]')
    expect(card).not.toContain('max-h-[min(46dvh,100%)]')
    const chrome = card.indexOf('smart-feed-bottom-chrome')
    const flexCopy = card.slice(Math.max(0, chrome - 240), chrome + 40)
    expect(flexCopy).toContain('mt-auto flex w-full shrink-0 flex-col')
    expect(flexCopy).not.toContain('flex-1 flex-col bg-gradient')
  })

  it('does not restore destination row or a second category rail', () => {
    const nav = read('src/components/layout/Navbar.tsx')
    expect(nav).not.toContain('header-dest-nav')
    expect(nav).toContain('header-surface-toggle')
    expect(nav).toContain('CategoryNav embedded')
    expect(nav).toContain('ContextRailSlot')
  })
})
