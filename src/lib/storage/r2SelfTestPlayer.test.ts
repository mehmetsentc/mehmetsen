import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('V1C.1R6 diagnostic player CSP + source', () => {
  it('allows HTTPS media so R2 playback is not blocked by default-src', () => {
    const config = readFileSync(new URL('../../../next.config.ts', import.meta.url), 'utf8')
    expect(config).toMatch(/media-src 'self' blob: https:/)
    expect(config).not.toMatch(/media-src 'self'(?!.*https:)/)
  })

  it('diagnostic player uses playbackPublicUrl and does not force crossOrigin', () => {
    const page = readFileSync(
      new URL('../../app/admin/video-library/r2-self-test/page.tsx', import.meta.url),
      'utf8',
    )
    expect(page).toContain('src={playbackUrl}')
    expect(page).toContain('<video')
    expect(page).not.toMatch(/crossOrigin/)
    expect(page).toContain('Cleanup Existing Validation')
    expect(page).not.toMatch(/useEffect/)
  })
})
