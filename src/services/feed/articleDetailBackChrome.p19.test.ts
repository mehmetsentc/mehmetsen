/**
 * /haber must always expose a Geri control (Navbar and/or ArticleBackBar / Lift).
 * AUTOMATED — NOT HUMAN GO / NOT deploy.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('Article detail back chrome', () => {
  it('ArticlePageChrome mounts ArticleBackBar', () => {
    const chrome = read('src/components/news/ArticlePageChrome.tsx')
    expect(chrome).toContain('ArticleBackBar')
    expect(chrome).toContain('ArticleSwipeNav')
  })

  it('ArticleBackBar clears safe-area and labels Geri', () => {
    const bar = read('src/components/news/ArticleBackBar.tsx')
    expect(bar).toContain('data-testid="article-back-bar"')
    expect(bar).toContain('safe-area-inset-top')
    expect(bar).toContain('Geri')
    expect(bar).toContain('BackNavButton')
  })

  it('Article Lift header has safe-area + Geri button', () => {
    const lift = read('src/components/articleLift/ArticleLiftShell.tsx')
    expect(lift).toContain('data-testid="article-lift-back"')
    expect(lift).toContain('safe-area-inset-top')
    expect(lift).toContain('Geri')
  })

  it('reader chrome lock CSS is scoped to Feed V2 reels stage only', () => {
    const css = read('src/app/globals.css')
    expect(css).toContain('smart-feed-reader-open:has(.content-main-reels) .mobile-top-chrome')
    expect(css).not.toMatch(
      /html\.smart-feed-reader-open \.mobile-top-chrome,\s*\n\s*body\.smart-feed-reader-open \.mobile-top-chrome,/
    )
  })

  it('MainLayout clears reader-open class on /haber', () => {
    const layout = read('src/components/layout/MainLayoutClient.tsx')
    expect(layout).toContain("pathname.startsWith('/haber/')")
    expect(layout).toContain("classList.remove('smart-feed-reader-open')")
  })
})
