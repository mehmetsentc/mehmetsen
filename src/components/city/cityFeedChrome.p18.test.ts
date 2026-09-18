/**
 * City Feed 2 chrome — brand red Haber, overlay spacing, glass dock.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('city Feed 2 chrome', () => {
  it('splits the city wordmark so Haber stays theme red', () => {
    const lockup = read('src/components/city/CityBrandLockup.tsx')
    expect(lockup).toContain('wordmark-haber-onbrand')
    expect(lockup).toContain('>Haber<')
    expect(lockup).not.toMatch(/NaHaber\s*<\/span>/)
  })

  it('starts the overlay header below the status bar and leaves a gap before chips', () => {
    const nav = read('src/components/city/CityNavbar.tsx')
    const css = read('src/app/globals.css')
    expect(nav).toContain('pt-[calc(var(--mobile-sat,env(safe-area-inset-top,0px))+0.7rem)]')
    expect(nav).not.toContain("'pt-0.5'")
    expect(css).toContain('html[data-city-overlay-chrome=\'1\'] .context-rail')
    expect(css).toMatch(
      /html\[data-city-overlay-chrome='1'\] \.context-rail[\s\S]{0,180}padding:\s*0\.85rem/
    )
  })

  it('keeps city overlay Haber red even under newspaper tokens', () => {
    const css = read('src/app/globals.css')
    expect(css).toContain('html[data-city-overlay-chrome=\'1\']')
    expect(css).toMatch(
      /html\[data-city-overlay-chrome='1'\][\s\S]{0,280}--wordmark-haber:\s*var\(--brand-500\)/
    )
    expect(css).toContain(
      "html[data-desktop-header='newspaper'] .mobile-top-chrome--overlay[data-city-overlay-chrome='1']"
    )
  })

  it('renders the city dock as a framed translucent pill', () => {
    const css = read('src/app/globals.css')
    const dock = read('src/components/city/CityMobileNav.tsx')
    expect(css).toContain('.city-mobile-bottom-nav-pill')
    expect(css).toMatch(/\.city-mobile-bottom-nav-pill[\s\S]{0,400}border-radius:\s*9999px/)
    expect(css).toMatch(/\.city-mobile-bottom-nav-pill[\s\S]{0,500}backdrop-filter:\s*blur/)
    expect(css).toMatch(/\.city-mobile-bottom-nav-pill[\s\S]{0,500}rgb\(12 12 16 \/ 0\.38\)/)
    expect(dock).toContain('city-mobile-bottom-nav-icon--active')
    expect(dock).not.toContain('bg-[rgb(var(--color-surface-raised))]')
  })
})
