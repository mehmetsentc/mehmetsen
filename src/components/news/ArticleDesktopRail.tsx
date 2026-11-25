import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { categoryPostHref, categoryPostImage } from '@/components/home/desktop/categoryPostUtils'
import type { ArticleLatestLink } from '@/lib/seo/articleLatestLinks'
import type { Post } from '@/types/post'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'

/**
 * Desktop (lg+) article right rail — sticky list of fresh stories so a reader
 * on a wide screen has somewhere to go next (BBC / Guardian pattern).
 * Hidden below lg by CSS; mobile article layout is unchanged.
 */
export function ArticleDesktopRail({
  latestLinks,
  relatedPosts = [],
}: {
  latestLinks: ArticleLatestLink[]
  relatedPosts?: Post[]
}) {
  // EURO-ARTICLE: Euronews "Gündem" bloğu gibi resimli 3 benzer haber, altında numaralı son haberler.
  const related = relatedPosts
    .map((post) => ({ post, image: categoryPostImage(post) }))
    .filter((x) => x.image)
    .slice(0, 3)
  if (latestLinks.length === 0 && related.length === 0) {
    return <aside className="article-desktop-rail" aria-hidden />
  }
  return (
    <aside className="article-desktop-rail" aria-label="Son haberler">
      <div className="article-desktop-rail__inner">
        {related.length > 0 ? (
          <section className="article-rail-related" aria-label="Benzer haberler">
            <h2 className="ed-rail-block__title">Benzer haberler</h2>
            <ul className="article-rail-related__list">
              {related.map(({ post, image }) => (
                <li key={post.id}>
                  <Link prefetch={false} href={categoryPostHref(post)} className="article-rail-related__item group">
                    <span className="article-rail-related__img">
                      <SafeNewsImage
                        src={image}
                        alt={post.title}
                        fill
                        sizes="110px"
                        className="object-cover"
                      />
                    </span>
                    <span className="article-rail-related__title">{post.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {latestLinks.length > 0 ? (
          <>
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
          </>
        ) : null}
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
