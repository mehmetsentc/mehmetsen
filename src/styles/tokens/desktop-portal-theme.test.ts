import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('desktop portal theme', () => {
  it('wires portal cards to global color tokens', () => {
    const src = readFileSync(join(process.cwd(), 'src/styles/tokens/desktop-portal-theme.css'), 'utf8')
    expect(src).toContain('--color-card')
    expect(src).toContain('--color-text')
    expect(src).toContain('--color-surface')
    expect(src).toContain('.desktop-portal-cat')
    expect(src).not.toMatch(/background:\s*#fff/)
  })

  it('is imported from the token entry', () => {
    const src = readFileSync(join(process.cwd(), 'src/styles/tokens/index.css'), 'utf8')
    expect(src).toContain("desktop-portal-theme.css")
  })
})
