import { describe, expect, it } from 'vitest'
import { articleCanonicalUrl } from '@/lib/seo/canonical'
import { buildPostMetadata } from '@/lib/seo'
import type { Post } from '@/types/post'

/** SEO-1B article regression: article canonical stays on www, host-independent. */
describe('SEO-1B article canonical regression', () => {
  it('10. articleCanonicalUrl → https://www.nahaber.com/haber/{slug} in production', () => {
    const prevEnv = process.env.VERCEL_ENV
    const prevUrl = process.env.NEXT_PUBLIC_APP_URL
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nahaber.com'
    try {
      const url = articleCanonicalUrl({ id: 'x1', slug: 'bozcaadada-liman-projesine-tepki' })
      expect(url).toBe('https://www.nahaber.com/haber/bozcaadada-liman-projesine-tepki')
      const m = buildPostMetadata({
        id: 'x1',
        slug: 'bozcaadada-liman-projesine-tepki',
        title: 'Bozcaada',
        content: 'Bozcaada liman projesine tepki.',
        categoryId: 'yerel-haber',
        city: 'Çanakkale',
        createdAt: new Date('2026-09-18T13:04:17Z'),
        publishedAt: new Date('2026-09-18T13:04:17Z'),
      } as unknown as Post)
      expect(m.alternates?.canonical).toBe(
        'https://www.nahaber.com/haber/bozcaadada-liman-projesine-tepki'
      )
    } finally {
      process.env.VERCEL_ENV = prevEnv
      process.env.NEXT_PUBLIC_APP_URL = prevUrl
    }
  })
})
