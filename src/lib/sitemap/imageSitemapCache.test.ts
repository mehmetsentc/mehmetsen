import { describe, expect, it, vi } from 'vitest'
import { createTtlSingleCache, IMAGE_SITEMAP_REVALIDATE_S } from '@/lib/sitemap/imageSitemapCache'

describe('image sitemap shared cache', () => {
  it('keeps the body for at least one hour', () => {
    expect(IMAGE_SITEMAP_REVALIDATE_S).toBeGreaterThanOrEqual(60 * 60)
  })

  it('reads Firestore on the first call and not on the second', async () => {
    let reads = 0
    let now = 1_000
    const get = createTtlSingleCache(
      async () => {
        reads += 1
        return '<urlset>one</urlset>'
      },
      60 * 60 * 1000,
      () => now
    )

    const first = await get()
    const second = await get()

    expect(first.cache).toBe('miss')
    expect(second.cache).toBe('hit')
    expect(second.xml).toBe(first.xml)
    expect(reads).toBe(1)
  })

  it('serves the last body when the read circuit is open', async () => {
    let now = 1_000
    let open = false
    const load = vi.fn(async () => '<urlset>kept</urlset>')
    const get = createTtlSingleCache(load, 1_000, () => now, () => open)

    await get()
    now += 5_000
    open = true
    const stale = await get()

    expect(stale.cache).toBe('stale')
    expect(stale.xml).toBe('<urlset>kept</urlset>')
    expect(load).toHaveBeenCalledTimes(1)
  })
})
