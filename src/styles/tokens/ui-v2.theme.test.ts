import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/styles/tokens/ui-v2.css'), 'utf8')

describe('UI-V2 theme tokens', () => {
  it('defines light aliases on :root and dark aliases only under .dark', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('.dark'))
    const dark = css.slice(css.indexOf('.dark'), css.indexOf("html[data-theme='oled']"))
    expect(root).toContain('--nah-bg: 250 247 243')
    expect(root).not.toContain('--nah-bg: 8 10 16')
    expect(dark).toContain('--nah-bg: 8 10 16')
  })

  it('does not force newspaper light mobile chrome to dark', () => {
    expect(css).not.toContain("html[data-desktop-header='newspaper']:not(.dark):not([data-theme='oled']):not(:has(.admin-shell))")
  })

  it('keeps desktop newspaper remaps out of >=1024', () => {
    expect(css).toContain('@media (min-width: 1024px)')
    expect(css).toContain('Desktop newspaper / portal keep existing tokens')
  })

  it('maps mobile chrome to semantic nah tokens instead of hardcoded white text', () => {
    expect(css).toContain('--color-border: var(--nah-border)')
    expect(css).toContain('--wordmark-na-onbrand: var(--nah-header-on)')
    expect(css).toContain('color: rgb(var(--nah-text))')
  })
})
