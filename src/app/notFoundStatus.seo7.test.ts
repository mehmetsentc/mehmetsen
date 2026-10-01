import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const app = join(process.cwd(), 'src/app')
const main = join(app, '(main)')

const NOT_FOUND_ROUTES = ['haber/[slug]', 'etiket/[slug]', 'yazar/[username]', 'kategori/[id]']

function hasPage(dir: string): boolean {
  return readdirSync(dir).some((name) => {
    const full = join(dir, name)
    if (name === 'page.tsx') return true
    return statSync(full).isDirectory() && hasPage(full)
  })
}

describe('SEO-7.2 notFound() reaches the HTTP status', () => {
  it.each(NOT_FOUND_ROUTES)('no loading.tsx between the root layout and /%s', (route) => {
    const segments = ['', '(main)', ...route.split('/')]
    let dir = app
    for (const segment of segments) {
      dir = join(dir, segment)
      expect(existsSync(join(dir, 'loading.tsx')), join(dir, 'loading.tsx')).toBe(false)
    }
  })

  it.each(NOT_FOUND_ROUTES)('/%s page calls notFound()', (route) => {
    const src = readFileSync(join(main, route, 'page.tsx'), 'utf8')
    expect(src).toContain('notFound()')
  })

  it('other (main) segments keep their loading skeleton', () => {
    const excluded = new Set(NOT_FOUND_ROUTES.map((r) => r.split('/')[0]))
    const missing = readdirSync(main)
      .filter((name) => !name.startsWith('@') && !excluded.has(name))
      .filter((name) => statSync(join(main, name)).isDirectory() && hasPage(join(main, name)))
      .filter((name) => !existsSync(join(main, name, 'loading.tsx')))
    expect(missing).toEqual([])
  })

  it('article page does not turn a load error into a cached 404', () => {
    const src = readFileSync(join(main, 'haber/[slug]/page.tsx'), 'utf8')
    const body = src.slice(src.indexOf('export default async function NewsDetailPage'))
    expect(body).toMatch(/^\s*const post = await getCachedNews\(slug\)$/m)
    expect(body).not.toContain('Client fallback')
  })
})
