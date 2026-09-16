/**
 * Soft-nav from anasayfa must not 404 via Article Lift intercept.
 * AUTOMATED — NOT HUMAN GO / NOT deploy.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('Article Lift soft-nav 404 guard (P19)', () => {
  it('national home lives under (main) so soft-nav shares @modal layout', () => {
    expect(existsSync(join(process.cwd(), 'src/app/page.tsx'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'src/app/(main)/page.tsx'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'src/app/(main)/default.tsx'))).toBe(true)

    const home = read('src/app/(main)/page.tsx')
    expect(home).toContain('NationalHomePage')
    expect(home.includes("from '@/components/layout/MainLayoutClient'")).toBe(false)
    expect(home.includes("from '@/components/city/CityLayoutClient'")).toBe(false)
    expect(home.includes('<MainLayoutClient')).toBe(false)
    expect(home.includes('<CityLayoutClient')).toBe(false)
  })

  it('intercepting lift never imports notFound; uses hard-nav fallback', () => {
    const intercept = read('src/app/(main)/@modal/(.)haber/[slug]/page.tsx')
    expect(intercept.includes('notFound')).toBe(true) // mentioned in comments only
    expect(intercept.includes("from 'next/navigation'")).toBe(false)
    expect(intercept).toContain('ArticleLiftHardNavFallback')
    expect(intercept).toContain('ROUTES.NEWS_DETAIL')

    const fallback = read('src/components/articleLift/ArticleLiftHardNavFallback.tsx')
    expect(fallback).toContain('window.location.replace')
  })
})
