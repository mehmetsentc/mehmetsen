/**
 * SEO-6 P0 — public param routes must be ISR (CDN HIT/STALE), not rendered per
 * request. In Next 15 a dynamic segment without `generateStaticParams` ignores
 * `revalidate` and responds `private, no-store`; any dynamic API does the same.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const ROUTES = [
  { file: 'src/app/(main)/haber/[slug]/page.tsx', revalidate: 3600 },
  { file: 'src/app/(main)/etiket/[slug]/page.tsx', revalidate: 300 },
  { file: 'src/app/(main)/yazar/[username]/page.tsx', revalidate: 180 },
  { file: 'src/app/(main)/kategori/[id]/page.tsx', revalidate: 300 },
]

describe('SEO-6 P0 public routes are on-demand ISR', () => {
  it.each(ROUTES)('$file: generateStaticParams + literal revalidate', ({ file, revalidate }) => {
    const src = read(file)
    expect(src).toMatch(/export function generateStaticParams\(\)\s*\{\s*return \[\]\s*\}/)
    expect(src).toContain(`export const revalidate = ${revalidate}\n`)
  })

  it.each(ROUTES)('$file: no dynamic APIs or dynamic overrides', ({ file }) => {
    const src = read(file)
    expect(src).not.toMatch(/export const dynamic\s*=/)
    expect(src).not.toContain("from 'next/headers'")
    expect(src).not.toContain('getCitySlugFromHeaders')
    expect(src).not.toContain('getActiveTenant')
    expect(src).not.toContain('searchParams')
    expect(src).not.toContain('noStore')
  })

  it('city hosts reach city-site/kategori for any id casing (lowercased)', () => {
    const mw = read('middleware.ts')
    expect(mw).toContain('cleanPath.match(/^\\/kategori\\/([a-z0-9-]+)$/i)')
    expect(mw).toContain('`/city-site/kategori/${categoryMatch[1].toLowerCase()}`')
    const cityPage = read('src/app/city-site/kategori/[id]/page.tsx')
    expect(cityPage).toContain('buildCityCategoryMetadata(tenant.slug, id)')
  })
})
