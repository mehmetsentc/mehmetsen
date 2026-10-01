/**
 * SEO-6 P2.2 — city home <title> carries the brand once. The root layout applies
 * `%s | NaHaber`, so the city home must use an absolute title.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

let currentHost = 'canakkale.nahaber.com'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: currentHost }),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('@/components/city/CityAdaptiveHome', () => ({ CityAdaptiveHome: () => null }))

type TitleMeta = { title?: string | { absolute?: string }; alternates?: { canonical?: string } }

/** Next.js title resolution against the root layout template. */
function resolvedTitle(title: TitleMeta['title']): string {
  if (title && typeof title === 'object' && title.absolute) return title.absolute
  return `${String(title)} | NaHaber`
}

async function cityHome(host: string): Promise<TitleMeta> {
  currentHost = host
  const mod = await import('@/app/city-site/page')
  return (await mod.generateMetadata()) as TitleMeta
}

beforeEach(() => {
  currentHost = 'canakkale.nahaber.com'
})

describe('SEO-6 P2.2 city home title', () => {
  it.each([
    ['canakkale', 'Çanakkale'],
    ['antalya', 'Antalya'],
  ])('%s: brand appears once, self canonical kept', async (slug, name) => {
    const m = await cityHome(`${slug}.nahaber.com`)
    const title = resolvedTitle(m.title)
    expect(title).toBe(`${name} Haberleri — NaHaber`)
    expect(title.match(/NaHaber/g)).toHaveLength(1)
    expect(m.alternates?.canonical).toBe(`https://${slug}.nahaber.com`)
  })
})
