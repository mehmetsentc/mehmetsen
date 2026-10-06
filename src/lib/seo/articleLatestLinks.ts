import type { NewsSitemapEntry } from '@/lib/sitemap/newsSitemap'

/** How many fresh story links each article page carries (SEO-10). */
export const ARTICLE_LATEST_LINK_LIMIT = 6

export type ArticleLatestLink = { slug: string; title: string }

/**
 * Fresh internal links for an article page: newest indexable stories from the
 * same category first, topped up with the newest stories overall. Input is the
 * cached news-sitemap window (48h, indexable only), so no extra reads.
 */
export function pickArticleLatestLinks(
  entries: readonly NewsSitemapEntry[],
  opts: { categoryId?: string | null; excludeSlugs?: Iterable<string>; limit?: number }
): ArticleLatestLink[] {
  const limit = opts.limit ?? ARTICLE_LATEST_LINK_LIMIT
  const seen = new Set<string>()
  for (const s of opts.excludeSlugs ?? []) if (s) seen.add(s)
  const sorted = [...entries]
    .filter((e) => e.slug && e.title)
    .sort((a, b) => b.publishedMs - a.publishedMs)
  const out: ArticleLatestLink[] = []
  const take = (e: NewsSitemapEntry) => {
    if (out.length >= limit || seen.has(e.slug)) return
    seen.add(e.slug)
    out.push({ slug: e.slug, title: e.title })
  }
  const cat = opts.categoryId?.trim()
  if (cat) for (const e of sorted) if (e.categoryId === cat) take(e)
  for (const e of sorted) take(e)
  return out
}
