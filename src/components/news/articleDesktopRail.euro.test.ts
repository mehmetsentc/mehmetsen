import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
;(globalThis as unknown as { React: typeof React }).React = React
import { renderToString } from 'react-dom/server'
import type { Post } from '@/types/post'

vi.mock('next/link', () => ({
  default: ({ children, prefetch: _p, ...rest }: { children: unknown; prefetch?: boolean; href: string }) => createElement('a', rest, children as never),
}))
vi.mock('@/components/news/SafeNewsImage', () => ({ SafeNewsImage: (p: { src: string; alt: string }) => createElement('img', { src: p.src, alt: p.alt }) }))

import { ArticleDesktopRail } from './ArticleDesktopRail'

const post = (i: number, image = true): Post =>
  ({
    id: `p${i}`,
    slug: `benzer-${i}`,
    title: `Benzer haber ${i}`,
    type: 'news',
    status: 'published',
    coverImageUrl: image ? `https://storage.googleapis.com/b/news-images/${i}.jpg` : undefined,
    publishedAt: '2026-11-25T09:00:00Z',
  }) as unknown as Post

describe('EURO-ARTICLE sağ sütun', () => {
  it('resimli en çok 3 benzer haber, altında numaralı son haberler', () => {
    const html = renderToString(
      createElement(ArticleDesktopRail, {
        latestLinks: [
          { slug: 'son-1', title: 'Son haber bir' },
          { slug: 'son-2', title: 'Son haber iki' },
        ],
        relatedPosts: [post(1), post(2), post(3), post(4)],
      })
    )
    expect(html).toContain('Benzer haberler')
    expect(html.match(/article-rail-related__item/g)?.length).toBe(3)
    expect(html).not.toContain('Benzer haber 4')
    expect(html).toContain('Son haber iki')
    expect(html.indexOf('>Benzer haberler<')).toBeLessThan(html.indexOf('>Son haberler<'))
  })

  it('benzer haber yoksa yalnız son haberler çizilir', () => {
    const html = renderToString(
      createElement(ArticleDesktopRail, { latestLinks: [{ slug: 'son-1', title: 'Son haber bir' }] })
    )
    expect(html).not.toContain('Benzer haberler')
    expect(html).toContain('Son haber bir')
  })
})
