/**
 * P0-C — city-host articles keep city chrome + www canonical, and the
 * national layout no longer opts public HTML out of the CDN.
 */
import * as React from 'react'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: (props: { alt?: string }) => createElement('img', { alt: props.alt ?? '' }),
}))

import { middleware } from '../../middleware'
import { articleCanonicalUrl } from '@/lib/seo/canonical'
import { getCityCategoryName } from '@/constants/cities'
import { CityBrandLockup } from '@/components/city/CityBrandLockup'
import { CityFooter } from '@/components/city/CityFooter'
import { CityCategoryProvider } from '@/store/cityCategoryContext'
import { ArticleRelatedLinks } from '@/components/news/ArticleRelatedLinks'
import type { Post } from '@/types/post'

;(globalThis as { React?: typeof React }).React = React

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

async function runMiddleware(url: string) {
  const host = new URL(url).host
  const request = new NextRequest(url, {
    headers: {
      host,
      'x-vercel-ip-country': 'TR',
    },
  })
  return middleware(request)
}

function rewritePath(response: Response): string {
  return response.headers.get('x-middleware-rewrite') ?? ''
}

function makePost(overrides: Partial<Post>): Post {
  return {
    id: 'p1',
    slug: 'ornek-haber',
    title: 'Örnek haber',
    categoryId: 'gundem',
    tags: [],
    ...overrides,
  } as unknown as Post
}

function hostArticleHtml(host: 'canakkale' | 'antalya', post: Post): string {
  const cityName = getCityCategoryName(host)
  const canonical = articleCanonicalUrl({ id: post.id, slug: post.slug ?? 'ornek-haber' })
  return renderToStaticMarkup(
    createElement(
      'article',
      { 'data-host': host },
      createElement('link', { rel: 'canonical', href: canonical }),
      createElement(
        'header',
        null,
        createElement(
          'a',
          { href: '/', 'aria-label': `${cityName} NaHaber` },
          createElement(CityBrandLockup, { cityName, provinceSlug: host, size: 'xl' })
        )
      ),
      createElement(
        CityCategoryProvider,
        { categories: [] },
        createElement(CityFooter, { cityName, provinceSlug: host })
      ),
      createElement(ArticleRelatedLinks, { post })
    )
  )
}

describe('P0-C city host article rewrite', () => {
  it('rewrites canakkale and antalya /haber/:slug into city-site', async () => {
    for (const host of ['canakkale', 'antalya'] as const) {
      const response = await runMiddleware(
        `https://${host}.nahaber.com/haber/bozcaadada-liman-projesine-tepki`
      )
      expect(rewritePath(response)).toContain(
        '/city-site/haber/bozcaadada-liman-projesine-tepki'
      )
    }
  })

  it('rewrites city /etiket/:slug into city-site', async () => {
    const response = await runMiddleware('https://canakkale.nahaber.com/etiket/deprem')
    expect(rewritePath(response)).toContain('/city-site/etiket/deprem')
  })

  it('does not rewrite www article or tag pages', async () => {
    const article = await runMiddleware('https://www.nahaber.com/haber/ornek-haber')
    const tag = await runMiddleware('https://www.nahaber.com/etiket/deprem')
    expect(rewritePath(article)).not.toContain('/city-site/')
    expect(rewritePath(tag)).not.toContain('/city-site/')
    expect(article.headers.get('set-cookie')).toBeNull()
    expect(tag.headers.get('set-cookie')).toBeNull()
  })

  it('national layout and home do not read headers or cookies', () => {
    const layout = read('src/app/(main)/layout.tsx')
    const home = read('src/app/(main)/page.tsx')
    for (const source of [layout, home]) {
      expect(source).not.toContain('headers(')
      expect(source).not.toContain('cookies(')
      expect(source).not.toContain('getCitySlugFromHeaders')
      expect(source).not.toContain('getActiveTenant')
      expect(source).not.toContain('searchParams')
    }
    expect(layout).toContain('MainLayoutClient')
    expect(home).toContain('revalidate = 60')
    expect(home).not.toContain('force-dynamic')
    const cityArticle = read('src/app/city-site/haber/[slug]/page.tsx')
    expect(cityArticle).toContain("from '../../../(main)/haber/[slug]/page'")
    expect(cityArticle).toContain('generateMetadata')
    expect(cityArticle).toContain('revalidate')
    expect(read('src/app/(main)/haber/[slug]/page.tsx')).toContain('revalidate = 3600')
    const cityLayout = read('src/app/city-site/layout.tsx')
    expect(cityLayout).toContain('CityLayoutClient')
  })
})

describe('P0-C city article HTML snapshot', () => {
  const prevEnv = process.env.VERCEL_ENV
  const prevUrl = process.env.NEXT_PUBLIC_APP_URL

  function withProductionSite(run: () => void) {
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nahaber.com'
    try {
      run()
    } finally {
      process.env.VERCEL_ENV = prevEnv
      process.env.NEXT_PUBLIC_APP_URL = prevUrl
    }
  }

  it('canakkale host: city header/footer, www canonical, experiment links', () => {
    withProductionSite(() => {
    const html = hostArticleHtml(
      'canakkale',
      makePost({
        slug: 'bozcaadada-liman-projesine-tepki',
        citySlug: 'canakkale',
        city: 'Çanakkale',
        districtSlug: 'biga',
      })
    )
    expect(html).toContain('aria-label="Çanakkale NaHaber"')
    expect(html).toContain('Çanakkale')
    expect(html).toContain('NaHaber')
    expect(html).toContain('href="/"')
    expect(html).toContain('href="/ilceler"')
    expect(html).toContain('href="/etkinlik"')
    expect(html).toContain('rel="canonical" href="https://www.nahaber.com/haber/bozcaadada-liman-projesine-tepki"')
    expect(html).toContain('https://canakkale.nahaber.com/')
    expect(html).toContain('https://canakkale.nahaber.com/ilceler/biga')
    expect(html).toContain('Biga Haberleri')
    expect(html).toMatchSnapshot()
    })
  })

  it('antalya host: city header/footer, www canonical, no experiment links', () => {
    withProductionSite(() => {
    const html = hostArticleHtml(
      'antalya',
      makePost({
        slug: 'antalya-sahilde-etkinlik',
        citySlug: 'antalya',
        city: 'Antalya',
        districtSlug: 'muratpasa',
      })
    )
    expect(html).toContain('aria-label="Antalya NaHaber"')
    expect(html).toContain('href="/ilceler"')
    expect(html).toContain('rel="canonical" href="https://www.nahaber.com/haber/antalya-sahilde-etkinlik"')
    expect(html).not.toContain('canakkale.nahaber.com')
    expect(html).not.toContain('Biga Haberleri')
    expect(html).not.toContain('Çanakkale Haberleri')
    expect(html).toMatchSnapshot()
    })
  })
})
