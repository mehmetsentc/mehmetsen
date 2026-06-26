import Link from 'next/link'
import { format, isValid } from 'date-fns'
import { tr } from 'date-fns/locale'
import { ChevronRight, Clock, Eye, Hash, MapPin, User } from 'lucide-react'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import { formatCount, getArticleBylineName } from '@/lib/postUtils'
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
  const categoryLabel = getCategoryLabel(post.categoryId)
  const publishedAt = post.publishedAt ?? post.createdAt
  const updatedAt = post.updatedAt && post.updatedAt !== publishedAt ? post.updatedAt : null
  const formatPublished = (value: string | null | undefined): string => {
    if (!value) return ''
    const date = new Date(value)
    return isValid(date) ? format(date, 'd MMMM yyyy, HH:mm', { locale: tr }) : ''
  }
  const publishedLabel = formatPublished(publishedAt)
  const updatedLabel = formatPublished(updatedAt)
  const bylineName = getArticleBylineName(post)
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
            <span className="inline-flex items-center gap-1 font-semibold text-[rgb(var(--color-text))]">
              <User className="h-3.5 w-3.5" />
              {bylineName}
            </span>
            {publishedLabel && (
              <>
                <span aria-hidden className="text-[rgb(var(--color-border))]">·</span>
                <time dateTime={publishedAt ?? ''}>{publishedLabel}</time>
              </>
            )}
            {updatedLabel && (
              <>
                <span aria-hidden className="text-[rgb(var(--color-border))]">·</span>
                <time dateTime={updatedAt ?? ''}>Güncellendi: {updatedLabel}</time>
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

        {/* Video player or cover image */}
        {(() => {
          const videoItem = post.mediaItems?.find((m) => m.type === 'video' && m.url?.trim())
          const isYouTube = Boolean(videoItem && /youtube[^/]*\/embed\//.test(videoItem.url))
          const isMp4 = Boolean(videoItem && !isYouTube && /\.mp4(\?|$)/i.test(videoItem.url))

          if (isYouTube && videoItem) {
            return (
              <figure className="relative bg-black">
                <div className="relative aspect-[16/9] w-full overflow-hidden">
                  <iframe
                    src={`${videoItem.url}?rel=0&modestbranding=1&playsinline=1`}
                    title={post.title}
                    className="absolute inset-0 h-full w-full border-0"
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                  <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-black/25 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white/65">
                    nahaber.com
                  </span>
                </div>
              </figure>
            )
          }

          if (isMp4 && videoItem) {
            return (
              <figure className="relative bg-black">
                <div className="relative aspect-[16/9] w-full overflow-hidden">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={videoItem.url}
                    poster={videoItem.thumbnailUrl ?? imageUrl ?? undefined}
                    controls
                    playsInline
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                  <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-black/25 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white/65">
                    nahaber.com
                  </span>
                </div>
              </figure>
            )
          }

          if (imageUrl) {
            return (
              <figure className="relative">
                <div className="relative aspect-[16/9] max-h-[min(70vh,560px)] w-full overflow-hidden bg-[rgb(var(--color-surface))]">
                  <SliderImage src={imageUrl} alt={post.title} priority />
                  <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white/70">
                    nahaber.com
                  </span>
                </div>
              </figure>
            )
          }

          return null
        })()}

        <div className="px-4 py-6 sm:px-8 sm:py-8">
          {showLead && (
            <p className="news-lead mb-8 border-l-4 border-[rgb(var(--color-brand))] bg-[rgb(var(--color-surface))] px-5 py-4 text-lg font-medium leading-relaxed text-[rgb(var(--color-text))] sm:text-xl">
              {leadText}
            </p>
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

          {/* Kaynak satırı */}
          {post.source && (
            <div className="mt-6 border-t border-[rgb(var(--color-border))] pt-4 text-sm text-[rgb(var(--color-muted))]">
              <span className="font-semibold">Kaynak: </span>
              <span>{post.source}</span>
              {categoryLabel && (
                <>
                  <span className="mx-1 text-[rgb(var(--color-border))]">/</span>
                  <span>{categoryLabel}</span>
                </>
              )}
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
