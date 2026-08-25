/**
 * Article-to-article navigation context.
 *
 * Saved to sessionStorage when a user opens an article from a carousel or feed,
 * so the article detail page can offer left/right swipe navigation.
 */

const KEY = 'na:article_nav'

export interface ArticleNavCtx {
  hrefs: string[]
  index: number
  source: 'featured' | 'feed' | 'category' | 'breaking'
}

export function saveArticleNav(ctx: ArticleNavCtx): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ctx))
  } catch {}
}

export function readArticleNav(): ArticleNavCtx | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ArticleNavCtx) : null
  } catch {
    return null
  }
}

export function clearArticleNav(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {}
}
