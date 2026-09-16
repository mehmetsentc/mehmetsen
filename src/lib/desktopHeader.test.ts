import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasDesktopWebHeader } from './desktopHeader'

describe('hasDesktopWebHeader', () => {
  it('keeps newspaper chrome on public reading routes', () => {
    expect(hasDesktopWebHeader('/')).toBe(true)
    expect(hasDesktopWebHeader('/gundem')).toBe(true)
    expect(hasDesktopWebHeader('/haber/ornek')).toBe(true)
  })

  it('turns newspaper paper-lock off for admin and other app shells', () => {
    expect(hasDesktopWebHeader('/admin')).toBe(false)
    expect(hasDesktopWebHeader('/admin/news')).toBe(false)
    expect(hasDesktopWebHeader('/login')).toBe(false)
    expect(hasDesktopWebHeader('/settings')).toBe(false)
    expect(hasDesktopWebHeader('/reels')).toBe(false)
  })
})

describe('newspaper light chrome tokens', () => {
  const css = readFileSync(
    join(process.cwd(), 'src/styles/tokens/desktop-newsletter.css'),
    'utf8'
  )
  const globalLock = css.slice(0, css.indexOf('Approved global newspaper masthead'))

  it('applies cream paper + ink chrome on light newspaper at every viewport', () => {
    expect(globalLock).toContain(
      "html[data-desktop-header='newspaper']:not(.dark):not([data-theme='oled']):not(:has(.admin-shell))"
    )
    expect(globalLock).toContain('--header-onbrand: 17 17 17')
    expect(globalLock).toContain('--header-brand-bg: 246 243 236')
    expect(globalLock).toContain('--color-text: 17 17 17')
    expect(globalLock).toContain('--color-text-secondary: 68 68 68')
  })

  it('does not lock dark/oled newspaper onto cream paper', () => {
    expect(css).toContain(
      ":not(.dark):not([data-theme='oled']) .desktop-newspaper"
    )
    expect(css).toContain('--color-text: 17 17 17')
    const creamLock = css.slice(css.indexOf('Approved global newspaper masthead'))
    expect(creamLock).toMatch(
      /:not\(\.dark\):not\(\[data-theme='oled'\]\) \.desktop-newspaper[\s\S]*--nl-paper: 246 243 236/
    )
    expect(creamLock).toContain('html.dark[data-platform=\'desktop\'][data-desktop-header=\'newspaper\'] .desktop-newspaper')
    expect(creamLock).toContain('--nl-paper: var(--bg-base)')
  })
})
