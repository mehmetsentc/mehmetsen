import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('sharp', () => ({ default: vi.fn() }))
vi.mock('@/lib/newsImageProxy', () => ({
  clampImageWidth: (n: number) => n,
  parsePublicImageUrl: (u: string) => new URL(u),
}))

import { GET } from './route'

const call = () => GET(new Request('https://www.nahaber.com/api/img?url=https%3A%2F%2Fcdn.example.com%2Fa.jpg&w=640'))

afterEach(() => vi.unstubAllGlobals())

describe('A9: /api/img caches permanent failures for a day as 404', () => {
  it.each([403, 404, 410])('upstream %i → 404, s-maxage 1 day', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status })))
    const res = await call()
    expect(res.status).toBe(404)
    expect(res.headers.get('CDN-Cache-Control')).toContain('s-maxage=86400')
  })

  it('upstream 503 stays a short-lived 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503 })))
    const res = await call()
    expect(res.status).toBe(502)
    expect(res.headers.get('CDN-Cache-Control')).toContain('s-maxage=3600')
  })

  it('non-image body → 404 for a day', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })))
    const res = await call()
    expect(res.status).toBe(404)
    expect(res.headers.get('CDN-Cache-Control')).toContain('s-maxage=86400')
  })
})
