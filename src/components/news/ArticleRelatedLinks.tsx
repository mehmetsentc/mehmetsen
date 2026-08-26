import Link from 'next/link'
import { ChevronRight, Hash, MapPin, Newspaper, Radio } from 'lucide-react'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { formatTagLabel } from '@/lib/tags'
import { buildPostSharePath } from '@/lib/seo/structuredData'

export interface ArticleRelatedLinksContext {
  publisher?: { slug: string; name: string } | null
  event?: { slug: string; title: string; sourceCount: number } | null
  relatedPosts?: Post[]
}

interface ArticleRelatedLinksProps {
  post: Post
  context?: ArticleRelatedLinksContext
}

/** Internal linking graph: publisher → category → city → event → related articles. */
export function ArticleRelatedLinks({ post, context }: ArticleRelatedLinksProps) {
  const categoryDef = DEFAULT_CATEGORIES.find((c) => c.id === post.categoryId)
  const categorySlug = categoryDef?.slug ?? post.categoryId
  const categoryLabel = getCategoryLabel(post.categoryId)
  const citySlug = post.citySlug?.trim()
  const cityName = post.city?.trim() || citySlug
  const publisher = context?.publisher
  const event = context?.event
  const related = (context?.relatedPosts ?? []).filter((p) => p.id !== post.id).slice(0, 4)

  const hasLinks = Boolean(publisher || post.categoryId || citySlug || event || related.length)
  if (!hasLinks) return null

  return (
    <aside
      aria-label="İlgili bağlantılar"
      className="mt-8 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4 sm:p-5"
    >
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
        İlgili
      </h2>
      <ul className="space-y-2 text-sm">
        {publisher ? (
          <li>
            <Link
              href={ROUTES.PUBLISHER(publisher.slug)}
              className="inline-flex items-center gap-2 font-medium text-[rgb(var(--color-brand))] hover:underline"
            >
              <Newspaper className="h-4 w-4 shrink-0" />
              {publisher.name}
            </Link>
          </li>
        ) : null}

        {post.categoryId ? (
          <li>
            <Link
              href={ROUTES.CATEGORY(categorySlug)}
              className="inline-flex items-center gap-2 text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))]"
            >
              <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
              {categoryLabel} haberleri
            </Link>
          </li>
        ) : null}

        {citySlug && cityName ? (
          <li>
            <Link
              href={ROUTES.LOCAL_CITY(citySlug)}
              className="inline-flex items-center gap-2 text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))]"
            >
              <MapPin className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
              {cityName} yerel haberler
            </Link>
          </li>
        ) : null}

        {event && event.sourceCount >= 2 ? (
          <li>
            <Link
              href={ROUTES.EVENT(event.slug)}
              className="inline-flex items-center gap-2 text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))]"
            >
              <Radio className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
              Bu olay {event.sourceCount} kaynak tarafından aktarıldı
            </Link>
          </li>
        ) : null}

        {post.tags.slice(0, 3).map((tag) => (
          <li key={tag}>
            <Link
              href={ROUTES.TAG(tag)}
              className="inline-flex items-center gap-2 text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-brand))]"
            >
              <Hash className="h-3.5 w-3.5 shrink-0" />
              {formatTagLabel(tag)}
            </Link>
          </li>
        ))}
      </ul>

      {related.length > 0 ? (
        <div className="mt-4 border-t border-[rgb(var(--color-border))] pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
            Benzer haberler
          </h3>
          <ul className="space-y-2">
            {related.map((item) => (
              <li key={item.id}>
                <Link
                  href={buildPostSharePath(item)}
                  className="line-clamp-2 text-sm font-medium text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))]"
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  )
}
