import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { categoryPostHref, categoryPostImage } from '@/components/home/desktop/categoryPostUtils'
import type { Post } from '@/types/post'

interface ArticleRelatedGridStaticProps {
  posts: Post[]
}

/** Server-rendered related articles — visible to crawlers without JavaScript. */
export function ArticleRelatedGridStatic({ posts }: ArticleRelatedGridStaticProps) {
  if (posts.length === 0) return null

  return (
    <section className="mt-8 border-t border-[rgb(var(--color-border))] pt-6 sm:mt-10 sm:pt-8" aria-label="İlgili haberler">
      <h2 className="mb-4 text-lg font-bold text-[rgb(var(--color-text))] sm:mb-5 sm:border-t-4 sm:border-[rgb(var(--color-text))] sm:pt-4 sm:text-xl">
        İlgili Haberler
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {posts.map((item) => {
          const image = categoryPostImage(item) || FEED_FALLBACK_LOGO
          return (
            <article key={item.id} className="min-w-0">
              <Link href={categoryPostHref(item)} className="group block">
                <div className="relative mb-2 aspect-[3/2] overflow-hidden bg-[rgb(var(--color-border))]">
                  <SafeNewsImage
                    src={image}
                    alt={item.title}
                    fill
                    sizes="(max-width: 640px) 50vw, 200px"
                    className="object-cover transition-transform group-hover:scale-[1.02]"
                  />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
                  {getCategoryLabel(item.categoryId)}
                </span>
                <h3 className="mt-1 line-clamp-3 text-sm font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline">
                  {item.title}
                </h3>
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}
