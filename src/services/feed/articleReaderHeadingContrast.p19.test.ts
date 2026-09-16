/**
 * Dark article-reader-shell must keep in-body h2/h3 readable.
 * AUTOMATED — NOT HUMAN GO / NOT deploy.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Article reader shell heading contrast (P19)', () => {
  it('forces light heading color inside .article-reader-shell', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    const start = css.indexOf('.article-reader-shell .article-block-heading')
    expect(start).toBeGreaterThan(-1)
    const block = css.slice(start, start + 700)
    expect(block).toContain('.news-article-body :is(h1, h2, h3, h4, h5, h6)')
    expect(block).toContain('color: var(--reader-page-text, #f4f1ea) !important')
    expect(block).toContain('-webkit-text-fill-color: var(--reader-page-text, #f4f1ea) !important')
  })
})
