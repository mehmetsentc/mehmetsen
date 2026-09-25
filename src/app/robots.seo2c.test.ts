/**
 * SEO-2C — robots.txt sitemap declarations per host.
 * City hosts advertise only their normal sitemap (their news sitemap is
 * permanently empty: article canonicals are www). www keeps all four.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ host: 'www.nahaber.com' }))
vi.mock('next/headers', () => ({ headers: async () => new Map([['host', state.host]]) }))

import robots from '@/app/robots'

type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }
const rulesOf = (r: Awaited<ReturnType<typeof robots>>) => (Array.isArray(r.rules) ? r.rules : [r.rules]) as Rule[]
const ruleFor = (r: Awaited<ReturnType<typeof robots>>, ua: string) =>
  rulesOf(r).find((x) => (Array.isArray(x.userAgent) ? x.userAgent.includes(ua) : x.userAgent === ua))

describe('SEO-2C robots sitemap declarations', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.nahaber.com')
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(['canakkale', 'antalya'])('%s: only the city /sitemap.xml, no news sitemap', async (city) => {
    state.host = `${city}.nahaber.com`
    const r = await robots()
    expect(r.sitemap).toEqual([`https://${city}.nahaber.com/sitemap.xml`])
    expect(JSON.stringify(r.sitemap)).not.toContain('news-sitemap.xml')
    expect(r.host).toBe(`${city}.nahaber.com`)
  })

  it('city rules unchanged (Googlebot-News, Googlebot-Image, *, AI bots)', async () => {
    state.host = 'canakkale.nahaber.com'
    const r = await robots()
    expect(ruleFor(r, 'Googlebot-News')).toEqual({
      userAgent: 'Googlebot-News',
      allow: ['/haber/', '/kategori/', '/etkinlik', '/spor'],
      disallow: ['/admin/', '/api/'],
    })
    expect(ruleFor(r, 'Googlebot-Image')).toEqual({
      userAgent: 'Googlebot-Image',
      allow: ['/haber/', '/kategori/'],
      disallow: ['/admin/', '/api/'],
    })
    const star = ruleFor(r, '*')!
    expect(star.allow).toBe('/')
    expect(star.disallow).toContain('/admin/')
    expect(ruleFor(r, 'GPTBot')?.disallow).toBe('/')
    expect(rulesOf(r)).toHaveLength(4)
  })

  it('www: all four national sitemaps, including news', async () => {
    state.host = 'www.nahaber.com'
    const r = await robots()
    expect(r.sitemap).toEqual([
      'https://www.nahaber.com/sitemap.xml',
      'https://www.nahaber.com/news-sitemap.xml',
      'https://www.nahaber.com/video-sitemap.xml',
      'https://www.nahaber.com/images-sitemap.xml',
    ])
    expect(r.host).toBe('https://www.nahaber.com')
  })

  it('www rules unchanged (Googlebot-News, Image, Video, *, AI bots)', async () => {
    state.host = 'www.nahaber.com'
    const r = await robots()
    expect(ruleFor(r, 'Googlebot-News')).toEqual({
      userAgent: 'Googlebot-News',
      allow: ['/haber/', '/kategori/', '/yerel/', '/', '/etiket/', '/cok-okunanlar'],
      disallow: ['/admin/', '/api/', '/ayarlar', '/settings', '/giris', '/login', '/kayit', '/register'],
    })
    expect(ruleFor(r, 'Googlebot-Image')?.allow).toEqual(['/haber/', '/kategori/', '/yerel/', '/', '/images-sitemap.xml'])
    expect(ruleFor(r, 'Googlebot-Video')?.allow).toEqual(['/haber/', '/reels', '/video', '/video-sitemap.xml'])
    expect(ruleFor(r, 'GPTBot')?.disallow).toBe('/')
    expect(rulesOf(r)).toHaveLength(5)
  })
})
