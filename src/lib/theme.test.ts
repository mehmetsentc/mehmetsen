import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, isForcedDarkPathname } from '@/lib/theme'

describe('theme', () => {
  it('defaults to system so day/night follows the device', () => {
    expect(DEFAULT_THEME).toBe('system')
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
  })
})
