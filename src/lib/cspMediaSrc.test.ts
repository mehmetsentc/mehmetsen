import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('CSP media-src', () => {
  it("retains media-src 'self' blob: https:", () => {
    const config = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8')
    expect(config).toMatch(/media-src 'self' blob: https:/)
  })
})
