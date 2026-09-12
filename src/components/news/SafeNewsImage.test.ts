import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shouldUseNextImage } from '@/lib/news/shouldUseNextImage'

const SOZCUCDN =
  'https://sozcu01.sozcucdn.com/sozcu/production/uploads/images/2026/9/bulent-arinc-melih-gokcekjpg-4JQRYCLeqUCxO9lBMV13HQ.jpg?h=900&mode=crop&scale=both&w=1200'

describe('SafeNewsImage remote RSS guard', () => {
  it('keeps the Discover sozcucdn thumbnail off next/image', () => {
    expect(shouldUseNextImage(SOZCUCDN)).toBe(false)
    const src = readFileSync(join(__dirname, 'SafeNewsImage.tsx'), 'utf8')
    expect(src).toContain("from '@/lib/news/shouldUseNextImage'")
    expect(src).toContain('shouldUseNextImage(resolvedSrc)')
    expect(src).toContain('<img')
    expect(src).toMatch(/if\s*\(\s*!useNextImage\s*\)/)
  })
})
