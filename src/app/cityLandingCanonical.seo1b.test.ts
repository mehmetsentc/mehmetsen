/**
 * SEO-1B — route-level metadata tests for city landing pages served on
 * `{city}.nahaber.com` (production path: host-aware public routes, not
 * `city-site/*`, because the root `middleware.ts` is not compiled).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

let currentHost = 'www.nahaber.com'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: currentHost }),
  cookies: async () => ({ get: () => undefined }),
}))

// Heavy UI / data modules are irrelevant to generateMetadata — stub them.
vi.mock('@/components/category/CategoryPageClient', () => ({}))
vi.mock('@/components/category/CategoryStructuredData', () => ({}))
vi.mock('@/components/city/CityDistrictsClient', () => ({}))
vi.mock('@/components/city/CityDutyPharmaciesClient', () => ({}))
vi.mock('@/components/city/CityEventsClient', () => ({}))
vi.mock('@/components/city/CityFeedPageClient', () => ({}))
vi.mock('@/components/city/CityJobsClient', () => ({}))
vi.mock('@/components/city/CityLayoutClient', () => ({}))
vi.mock('@/components/city/CityNewspaperCategoryPage', () => ({}))
vi.mock('@/components/home/desktop/categoryPostUtils', () => ({ categoryPostImage: () => null }))
vi.mock('@/components/ui/Skeleton', () => ({}))
vi.mock('@/services/cityNewsService.server', () => ({}))
vi.mock('@/services/dutyPharmacyService.server', () => ({}))
vi.mock('@/services/eventService.server', () => ({}))
vi.mock('@/services/jobClassifiedService.server', () => ({}))
vi.mock('@/services/jobListingService.server', () => ({}))
vi.mock('@/services/scopedCategoryPresence.server', () => ({}))
vi.mock('@/services/sportsApi/worldCup2026', () => ({}))
vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => {
    throw new Error('no firestore in unit tests')
  },
}))

type Meta = {
  title?: unknown
  description?: unknown
  robots?: unknown
  alternates?: { canonical?: string; languages?: unknown }
  openGraph?: { url?: string; images?: unknown }
  twitter?: { images?: unknown }
}

type MetadataModule = { generateMetadata: (arg?: unknown) => Promise<unknown> }

async function meta(host: string, load: () => Promise<unknown>, params?: Record<string, string>) {
  currentHost = host
  const mod = (await load()) as MetadataModule
  const arg = params ? { params: Promise.resolve(params) } : undefined
  return (await mod.generateMetadata(arg)) as Meta
}

const ilceler = () => import('@/app/ilceler/page')
const ilce = () => import('@/app/ilceler/[slug]/page')
const eczane = () => import('@/app/nobetci-eczaneler/page')
const eczaneIlce = () => import('@/app/nobetci-eczaneler/[district]/page')
const isIlanlari = () => import('@/app/is-ilanlari/page')
const etkinlik = () => import('@/app/etkinlik/page')
const kategori = () => import('@/app/(main)/kategori/[id]/page')

function expectSelf(m: Meta, url: string) {
  expect(m.alternates?.canonical).toBe(url)
  expect(m.openGraph?.url).toBe(url)
  expect(m.alternates?.languages).toBeUndefined()
  expect(m.openGraph?.images).toBeTruthy()
  expect(m.twitter?.images).toBeTruthy()
}

beforeEach(() => {
  currentHost = 'www.nahaber.com'
})

describe('SEO-1B city landing pages → self canonical', () => {
  it('1. canakkale /ilceler/biga', async () => {
    const m = await meta('canakkale.nahaber.com', ilce, { slug: 'biga' })
    expectSelf(m, 'https://canakkale.nahaber.com/ilceler/biga')
    expect(m.title).toBe('Biga Haberleri — Çanakkale')
  })

  it('2. canakkale /kategori/spor', async () => {
    const m = await meta('canakkale.nahaber.com', kategori, { id: 'spor' })
    expectSelf(m, 'https://canakkale.nahaber.com/kategori/spor')
    expect(m.title).toBe('Çanakkale Spor Haberleri')
  })

  it('3. antalya /ilceler/alanya', async () => {
    const m = await meta('antalya.nahaber.com', ilce, { slug: 'alanya' })
    expectSelf(m, 'https://antalya.nahaber.com/ilceler/alanya')
  })

  it('4. antalya /kategori/spor', async () => {
    const m = await meta('antalya.nahaber.com', kategori, { id: 'spor' })
    expectSelf(m, 'https://antalya.nahaber.com/kategori/spor')
  })

  it.each(['canakkale', 'antalya'])('5. %s hub routes', async (city) => {
    const host = `${city}.nahaber.com`
    const origin = `https://${host}`
    expectSelf(await meta(host, ilceler), `${origin}/ilceler`)
    expectSelf(await meta(host, eczane), `${origin}/nobetci-eczaneler`)
    expectSelf(await meta(host, isIlanlari), `${origin}/is-ilanlari`)
    expectSelf(await meta(host, etkinlik), `${origin}/etkinlik`)
    const district = city === 'canakkale' ? 'biga' : 'alanya'
    expectSelf(await meta(host, eczaneIlce, { district }), `${origin}/nobetci-eczaneler/${district}`)
  })

  it('6a. invalid / foreign district → no self canonical', async () => {
    const bogus = await meta('canakkale.nahaber.com', ilce, { slug: 'olmayan-ilce' })
    expect(bogus.alternates).toBeUndefined()
    // real district of another province (Alanya ∉ Çanakkale)
    const foreign = await meta('canakkale.nahaber.com', ilce, { slug: 'alanya' })
    expect(foreign.alternates).toBeUndefined()
    expect(foreign.openGraph).toBeUndefined()
    const eczForeign = await meta('canakkale.nahaber.com', eczaneIlce, { district: 'alanya' })
    expect(eczForeign.alternates).toBeUndefined()
  })

  it('6b. invalid category / unsafe id → no self canonical', async () => {
    const bogus = await meta('canakkale.nahaber.com', kategori, { id: 'olmayan-kategori' })
    expect(bogus.alternates).toBeUndefined()
    expect(bogus.robots).toEqual({ index: false, follow: false })
    const upper = await meta('canakkale.nahaber.com', kategori, { id: 'SPOR' })
    // resolves (lowercased) → canonical is the lowercase route
    expect(upper.alternates?.canonical).toBe('https://canakkale.nahaber.com/kategori/spor')
  })

  it('7. synthetic third city: izmir /ilceler/karsiyaka', async () => {
    const m = await meta('izmir.nahaber.com', ilce, { slug: 'karsiyaka' })
    expectSelf(m, 'https://izmir.nahaber.com/ilceler/karsiyaka')
    expectSelf(await meta('izmir.nahaber.com', kategori, { id: 'siyaset' }), 'https://izmir.nahaber.com/kategori/siyaset')
  })
})

describe('SEO-1B www regression (citySlug = null branch unchanged)', () => {
  it('8. www /kategori/spor + /kategori/siyaset keep their own www canonical', async () => {
    const prevEnv = process.env.VERCEL_ENV
    const prevUrl = process.env.NEXT_PUBLIC_APP_URL
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nahaber.com'
    try {
      for (const id of ['spor', 'siyaset']) {
        const m = await meta('www.nahaber.com', kategori, { id })
        expect(m.alternates?.canonical).toBe(`https://www.nahaber.com/kategori/${id}`)
        expect(m.openGraph?.url).toBe(`https://www.nahaber.com/kategori/${id}`)
      }
    } finally {
      process.env.VERCEL_ENV = prevEnv
      process.env.NEXT_PUBLIC_APP_URL = prevUrl
    }
  })

  it('9. www shared routes return the exact pre-SEO-1B metadata', async () => {
    expect(await meta('www.nahaber.com', ilceler)).toEqual({
      title: 'Yerel Haberler',
      description: '81 ilden yerel son dakika haberler ve şehir gündemleri.',
    })
    expect(await meta('www.nahaber.com', ilce, { slug: 'biga' })).toEqual({})
    expect(await meta('www.nahaber.com', eczane)).toEqual({ title: 'Nöbetçi Eczaneler' })
    expect(await meta('www.nahaber.com', eczaneIlce, { district: 'biga' })).toEqual({
      title: 'Nöbetçi Eczaneler',
    })
    expect(await meta('www.nahaber.com', isIlanlari)).toEqual({
      title: 'İş İlanları',
      description: 'Şehir iş ilanları (Kariyer.net, İŞKUR).',
    })
    expect(await meta('www.nahaber.com', etkinlik)).toEqual({
      title: 'Etkinlikler',
      description: 'Türkiye genelinde konser, tiyatro, festival ve etkinlikler.',
    })
    // apex host behaves like www
    expect(await meta('nahaber.com', ilceler)).toEqual({
      title: 'Yerel Haberler',
      description: '81 ilden yerel son dakika haberler ve şehir gündemleri.',
    })
  })
})
