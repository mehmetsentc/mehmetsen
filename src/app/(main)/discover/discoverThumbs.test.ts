import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PAGE = join(__dirname, 'page.tsx')

describe('Discover category thumbs', () => {
  it('keeps Gündem cards off next/image and SafeNewsImage', () => {
    const src = readFileSync(PAGE, 'utf8')
    expect(src).toContain('function DiscoverThumb')
    expect(src).toContain('<DiscoverThumb src={imageUrl} />')
    expect(src).not.toMatch(/from ['"]next\/image['"]/)
    expect(src).not.toMatch(/from ['"]@\/components\/news\/SafeNewsImage['"]/)
    expect(src).toContain('<img')
  })
})
