import Link from 'next/link'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { ChevronRight, Clock, ExternalLink, Eye, Hash, MapPin, User } from 'lucide-react'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import { formatCount } from '@/lib/postUtils'
import { formatTagLabel } from '@/lib/tags'
import { cityCategoryId } from '@/lib/location'
import { parseArticleContent } from '@/lib/articleBodyUtils'
import { SliderImage } from '@/components/widgets/SliderImage'

interface NewsArticleStaticProps {
  post: Post
}

/** Server-rendered article — crawlable before client JS. */
export function NewsArticleStatic({ post }: NewsArticleStaticProps) {
  const imageUrl = post.coverImageUrl?.trim() || null
  const sourceLabel = post.source?.trim() || post.authorDisplayName
  const categoryLabel = getCategoryLabel(post.categoryId)
  const publishedAt = post.publishedAt ?? post.createdAt
  const publishedLabel = publishedAt
    ? format(new Date(publishedAt), 'd MMMM yyyy, HH:mm', { locale: tr })
    : ''
  const authorName = post.authorDisplayName !== 'nahaber' ? post.authorDisplayName : sourceLabel
  const hasTags = post.tags.length > 0
  const hasCity = Boolean(post.city || post.citySlug)

  const {
    articleTitle,
    leadText,
    showLead,
    hasHtmlContent,
    sanitizedHtml,
    paragraphs,
    readMinutes,
  } = parseArticleContent(post)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4 sm:px-0" id="news-article-static">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-[rgb(var(--color-muted))]">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href={ROUTES.FEED} className="hover:text-[rgb(var(--color-text))]">
              Ana Sayfa
            </Link>
          </li>
          <li aria-hidden className="flex items-center">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          {post.categoryId && (
            <>
              <li>
                <Link
                  href={ROUTES.CATEGORY(post.categoryId)}
                  className="hover:text-[rgb(var(--color-text))]"
                >
                  {categoryLabel}
                </Link>
              </li>
              <li aria-hidden className="flex items-center">
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
            </>
          )}
          <li className="line-clamp-1 font-medium text-[rgb(var(--color-text))]" aria-current="page">
            {articleTitle}
          </li>
        </ol>
      </nav>

      <article className="overflow-hidden rounded-none border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] sm:rounded-2xl">
        <header className="border-b border-[rgb(var(--color-border))] px-4 py-6 sm:px-8 sm:py-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-[rgb(var(--color-brand))]/10 px-2.5 py-0.5 text-xs font-semibold text-[rgb(var(--color-brand))]">
              {categoryLabel}
            </span>
            {sourceLabel && (
              <span className="inline-flex items-center rounded-full bg-[rgb(var(--color-surface))] px-2.5 py-0.5 text-xs font-semibold text-[rgb(var(--color-text))] ring-1 ring-[rgb(var(--color-border))]">
                {sourceLabel}
              </span>
            )}
            {post.isBreaking && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                Son Dakika
              </span>
            )}
          </div>

          <h1 className="text-2xl font-black leading-tight tracking-tight text-[rgb(var(--color-text))] sm:text-3xl lg:text-4xl">
            {articleTitle}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[rgb(var(--color-muted))]">
            {authorName && (
              <span className="inline-flex items-center gap-1 font-semibold text-[rgb(var(--color-text))]">
                <User className="h-3.5 w-3.5" />
                {authorName}
              </span>
            )}
            {publishedLabel && (
              <>
                <span aria-hidden className="text-[rgb(var(--color-border))]">·</span>
                <time dateTime={publishedAt ?? ''}>{publishedLabel}</time>
              </>
            )}
            <span aria-hidden className="text-[rgb(var(--color-border))]">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {readMinutes} dk okuma
            </span>
            {post.viewsCount > 0 && (
              <>
                <span aria-hidden className="text-[rgb(var(--color-border))]">·</span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {formatCount(post.viewsCount)} görüntülenme
                </span>
              </>
            )}
          </div>
        </header>

        {imageUrl && (
          <figure className="relative">
            <div className="relative aspect-[16/9] max-h-[min(70vh,560px)] w-full overflow-hidden bg-[rgb(var(--color-surface))]">
              <SliderImage src={imageUrl} alt={post.title} priority />
            </div>
            {sourceLabel && (
              <figcaption className="border-b border-[rgb(var(--color-border))] px-4 py-2 text-xs text-[rgb(var(--color-muted))] sm:px-8">
                {post.title} — {sourceLabel}
              </figcaption>
            )}
          </figure>
        )}

        <div className="px-4 py-6 sm:px-8 sm:py-8">
          {showLead && (
            <p className="news-lead mb-8 border-l-4 border-[rgb(var(--color-brand))] bg-[rgb(var(--color-surface))] px-5 py-4 text-lg font-medium leading-relaxed text-[rgb(var(--color-text))] sm:text-xl">
              {leadText}
            </p>
          )}

          {post.sourceUrl && (
            <div className="mb-8">
              <a
                href={post.sourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgb(var(--color-brand))] bg-[rgb(var(--color-brand))]/10 px-5 py-3.5 text-base font-bold text-[rgb(var(--color-brand))] transition-colors hover:bg-[rgb(var(--color-brand))]/20 sm:w-auto"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                Haberin Tamamını Oku
              </a>
            </div>
          )}

          {hasHtmlContent && sanitizedHtml && (
            <div
              className="news-body prose prose-lg max-w-none text-[rgb(var(--color-text))]"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          )}

          {!hasHtmlContent && paragraphs.length > 0 && (
            <div className="news-body space-y-6 text-[17px] leading-[1.85] text-[rgb(var(--color-text))] sm:text-[18px]">
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          )}

          {!showLead && !hasHtmlContent && paragraphs.length === 0 && (
            <p className="text-[rgb(var(--color-muted))]">Bu haber için içerik bulunamadı.</p>
          )}

          {sourceLabel && (
            <div className="mt-8 border-t border-[rgb(var(--color-border))] pt-5">
              <p className="text-sm text-[rgb(var(--color-muted))]">
                Kaynak:{' '}
                <span className="font-semibold text-[rgb(var(--color-text))]">{sourceLabel}</span>
              </p>
            </div>
          )}

          {(hasTags || hasCity) && (
            <section aria-label="Etiketler" className="mt-6">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                Etiketler
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {hasCity && post.citySlug && (
                  <Link
                    href={`${ROUTES.FEED}?category=${encodeURIComponent(cityCategoryId(post.citySlug))}`}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"
                  >
                    <MapPin className="h-3 w-3" />
                    {post.city ?? post.citySlug}
                  </Link>
                )}
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`${ROUTES.SEARCH}?q=${encodeURIComponent(tag)}`}
                    className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--color-surface))] px-2.5 py-1 text-xs font-semibold text-blue-600 ring-1 ring-[rgb(var(--color-border))]"
                  >
                    <Hash className="h-3 w-3" />
                    {formatTagLabel(tag).slice(1)}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </article>
    </div>
  )
}
