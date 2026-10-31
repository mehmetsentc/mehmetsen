import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { categoryPostHref } from '@/components/home/desktop/categoryPostUtils'
import type { ArticleLatestLink } from '@/lib/seo/articleLatestLinks'
import type { Post } from '@/types/post'

/**
 * Desktop (lg+) article right rail — sticky list of fresh stories so a reader
 * on a wide screen has somewhere to go next (BBC / Guardian pattern).
 * Hidden below lg by CSS; mobile article layout is unchanged.
 */
export function ArticleDesktopRail({ latestLinks }: { latestLinks: ArticleLatestLink[] }) {
  if (latestLinks.length === 0) return <aside className="article-desktop-rail" aria-hidden />
  return (
    <aside className="article-desktop-rail" aria-label="Son haberler">
      <div className="article-desktop-rail__inner">
        <h2 className="ed-rail-block__title">Son haberler</h2>
        <ol className="ed-list ed-list--numbered">
          {latestLinks.map((link, index) => (
            <li key={link.slug} className="ed-list__item">
              <span className="ed-list__rank" aria-hidden>
                {index + 1}
              </span>
              <Link prefetch={false} href={ROUTES.NEWS_DETAIL(link.slug)} className="ed-list__title">
                {link.title}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  )
}

/** In-body "İlgili" box (desktop only), BBC style: two headlines between rules. */
export function ArticleInlineRelated({ posts }: { posts: Post[] }) {
  const items = posts.slice(0, 2)
  if (items.length === 0) return null
  return (
    <aside className="article-inline-related" aria-label="İlgili haberler">
      {items.map((post) => (
        <Link key={post.id} prefetch={false} href={categoryPostHref(post)} className="article-inline-related__link">
          {post.title}
        </Link>
      ))}
    </aside>
  )
}
