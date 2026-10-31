import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  DESKTOP_DEFAULT_THEME,
  DESKTOP_THEME_MIN_WIDTH,
  isForcedDarkPathname,
} from '@/lib/theme'

describe('theme', () => {
  it('defaults to dark on first visit; a stored choice still wins', () => {
    expect(DEFAULT_THEME).toBe('dark')
  })

  it('opens light on desktop first visit; mobile default stays dark', () => {
    expect(DESKTOP_DEFAULT_THEME).toBe('light')
    expect(DESKTOP_THEME_MIN_WIDTH).toBe(1024)
  })

  it('does not force Feed 2 dark — light, dark, and system all apply', () => {
    expect(isForcedDarkPathname('/feed-v2')).toBe(false)
    expect(isForcedDarkPathname('/feed-v2/x')).toBe(false)
    expect(isForcedDarkPathname('/')).toBe(false)
    expect(isForcedDarkPathname('/haber/ornek')).toBe(false)
  })

  it('keeps video surfaces dark', () => {
    expect(isForcedDarkPathname('/reels')).toBe(true)
    expect(isForcedDarkPathname('/video')).toBe(true)
  })

  it('boot script matches Feed 2 theme follow', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/theme/ThemeScript.tsx'), 'utf8')
    expect(src).not.toContain("path === '/feed-v2'")
    expect(src).toContain("path === '/reels'")
    expect(src).toContain("pref = localStorage.getItem")
    expect(src).toContain("'system'")
    // No stored preference → desktop light, otherwise DEFAULT_THEME (dark); never the device setting.
    expect(src).toContain("? '${DESKTOP_DEFAULT_THEME}' : '${DEFAULT_THEME}'")
  })
})
