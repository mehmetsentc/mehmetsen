'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { ChevronRight, Clock, Eye, Hash, MapPin, ExternalLink, User } from 'lucide-react'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import { formatCount } from '@/lib/postUtils'
import { formatTagLabel } from '@/lib/tags'
import { cityCategoryId } from '@/lib/location'
import { Badge } from '@/components/ui/Badge'
import { LikeButton } from '@/components/post/LikeButton'
import { SaveButton } from '@/components/post/SaveButton'
import { ShareButton } from '@/components/post/ShareButton'
import { PostComments } from '@/components/post/PostComments'
import { SuggestedNewsRail } from '@/components/post/SuggestedNewsRail'
import { useLike } from '@/hooks/useLike'
import { useSave } from '@/hooks/useSave'
import { cn } from '@/lib/utils'
import { splitNewsParagraphs } from '@/lib/newsContent'
import {
  cleanupNewsBody,
  cleanupNewsSummary,
  cleanupNewsTitle,
} from '@/lib/newsContentCleanup'
import {
  useNetworkTier,
  imageQualityForTier,
  scaleSizesForTier,
} from '@/store/networkContext'

interface NewsArticleLayoutProps {
  post: Post
  suggested: Post[]
}

function estimateReadMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

function normalizeForCompare(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/** Sanitize extracted HTML for safe rendering */
function sanitizeHtml(html: string): string {
  // Strip all script/style/iframe/event handlers
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    // Fix relative image URLs (skip — they won't load anyway)
    .replace(/<img[^>]+>/gi, '')
    // Clean up empty tags
    .replace(/<(\w+)[^>]*>\s*<\/\1>/gi, '')
}

export function NewsArticleLayout({ post, suggested }: NewsArticleLayoutProps) {
  const tier = useNetworkTier()
  const imageUrl = post.coverImageUrl?.trim() || null
  const sourceLabel = post.source?.trim() || post.authorDisplayName
  const categoryLabel = getCategoryLabel(post.categoryId)
  const publishedAt = post.publishedAt ?? post.createdAt
  const publishedLabel = publishedAt
    ? format(new Date(publishedAt), 'd MMMM yyyy, HH:mm', { locale: tr })
    : ''

  const readText = [post.summary, post.content].filter(Boolean).join(' ')
  const readMinutes = post.readingTimeMinutes ?? estimateReadMinutes(readText)

  // Prefer AI spot (journalistic lead) → summary fallback
  const spotText = post.spot?.trim() || ''
  const summaryText = cleanupNewsSummary(post.summary?.trim() || '')
  const leadText = spotText || summaryText
  const bodyText = cleanupNewsBody(post.content?.trim() || '', { preserveSourceLine: false })
  const articleTitle = cleanupNewsTitle(post.title)

  const showLead = Boolean(leadText)
  const showBody =
    Boolean(bodyText) &&
    (!leadText || normalizeForCompare(bodyText) !== normalizeForCompare(leadText))

  // Prefer extracted HTML content; fallback to paragraphs
  const hasHtmlContent = Boolean(post.htmlContent?.trim())
  const sanitizedHtml = hasHtmlContent ? sanitizeHtml(post.htmlContent!) : ''
  const paragraphs = (!hasHtmlContent && showBody) ? splitNewsParagraphs(bodyText) : []

  const hasTags = post.tags.length > 0
  const hasCity = Boolean(post.city || post.citySlug)
  const authorName = post.authorDisplayName !== 'nahaber' ? post.authorDisplayName : sourceLabel

  const { liked, count: likesCount, toggle: toggleLike, loading: likeLoading } = useLike({
    postId: post.id,
    initialCount: post.likesCount,
  })

  const { saved, count: savesCount, toggle: toggleSave, loading: saveLoading } = useSave({
    postId: post.id,
    initialCount: post.savesCount,
  })

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 sm:px-0">
      {/* Breadcrumb */}
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
                  href={`${ROUTES.FEED}?category=${encodeURIComponent(post.categoryId)}`}
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
        {/* Header */}
        <header className="border-b border-[rgb(var(--color-border))] px-4 py-6 sm:px-8 sm:py-8">
          {/* Category + Source badges */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="category">{categoryLabel}</Badge>
            {sourceLabel && (
              <span className="inline-flex items-center rounded-full bg-[rgb(var(--color-surface))] px-2.5 py-0.5 text-xs font-semibold text-[rgb(var(--color-text))] ring-1 ring-[rgb(var(--color-border))]">
                {sourceLabel}
              </span>
            )}
            {post.isBreaking && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                Son Dakika
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-black leading-tight tracking-tight text-[rgb(var(--color-text))] sm:text-3xl lg:text-4xl">
            {articleTitle}
          </h1>

          {/* Meta row */}
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

        {/* Featured image */}
        {imageUrl && (
          <figure className="relative">
            <div className="relative aspect-[16/9] max-h-[min(70vh,560px)] w-full overflow-hidden bg-[rgb(var(--color-surface))]">
              <SafeNewsImage
                src={imageUrl}
                alt={post.title}
                fill
                quality={imageQualityForTier(tier)}
                className="object-cover"
                sizes={scaleSizesForTier('(max-width: 768px) 100vw, 768px', tier)}
                priority
              />
            </div>
            {sourceLabel && (
              <figcaption className="border-b border-[rgb(var(--color-border))] px-4 py-2 text-xs text-[rgb(var(--color-muted))] sm:px-8">
                {post.title} — {sourceLabel}
              </figcaption>
            )}
          </figure>
        )}

        {/* Article body */}
        <div className="px-4 py-6 sm:px-8 sm:py-8">
          {/* Spot / Lead paragraph — journalistic 5W+H intro */}
          {showLead && (
            <blockquote className="news-lead mb-8 border-l-4 border-[rgb(var(--color-brand))] bg-[rgb(var(--color-surface))] px-5 py-4 text-lg font-medium leading-relaxed text-[rgb(var(--color-text))] sm:text-xl not-italic">
              {leadText}
            </blockquote>
          )}

          {/* Full HTML content (extracted from source) */}
          {hasHtmlContent && sanitizedHtml && (
            <div
              className="news-body prose prose-lg max-w-none text-[rgb(var(--color-text))] [&>p]:mb-6 [&>p]:leading-[1.85] [&>h2]:mb-4 [&>h2]:mt-8 [&>h2]:text-xl [&>h2]:font-black [&>h3]:mb-3 [&>h3]:mt-6 [&>h3]:text-lg [&>h3]:font-bold [&>ul]:mb-6 [&>ul]:list-disc [&>ul]:pl-6 [&>li]:mb-2 [&>blockquote]:border-l-4 [&>blockquote]:border-[rgb(var(--color-brand))] [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-[rgb(var(--color-muted))]"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          )}

          {/* Plain text paragraphs (fallback) */}
          {!hasHtmlContent && paragraphs.length > 0 && (
            <div className="news-body space-y-6 text-[17px] leading-[1.85] tracking-[0.01em] text-[rgb(var(--color-text))] sm:text-[18px]">
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          )}

          {!showLead && !hasHtmlContent && paragraphs.length === 0 && (
            <p className="text-[rgb(var(--color-muted))]">Bu haber için içerik bulunamadı.</p>
          )}

          {/* Source link */}
          {(post.sourceUrl || sourceLabel) && (
            <div className="mt-8 border-t border-[rgb(var(--color-border))] pt-5">
              <p className="text-sm text-[rgb(var(--color-muted))]">
                Kaynak:{' '}
                {post.sourceUrl ? (
                  <a
                    href={post.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 font-semibold text-[rgb(var(--color-brand))] hover:underline"
                  >
                    {sourceLabel || 'Haberin kaynağını görüntüle'}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span className="font-semibold text-[rgb(var(--color-text))]">{sourceLabel}</span>
                )}
              </p>
            </div>
          )}

          {/* Tags */}
          {(hasTags || hasCity) && (
            <section aria-label="Etiketler" className="mt-6">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                Etiketler
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {hasCity && post.citySlug && (
                  <Link
                    href={`${ROUTES.FEED}?category=${encodeURIComponent(cityCategoryId(post.citySlug))}`}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900"
                  >
                    <MapPin className="h-3 w-3" />
                    {post.city ?? post.citySlug}
                  </Link>
                )}
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`${ROUTES.SEARCH}?q=${encodeURIComponent(tag)}`}
                    className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--color-surface))] px-2.5 py-1 text-xs font-semibold text-blue-600 ring-1 ring-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-nav-hover))] dark:text-blue-400"
                  >
                    <Hash className="h-3 w-3" />
                    {formatTagLabel(tag).slice(1)}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Actions */}
          <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-[rgb(var(--color-border))] pt-5">
            <LikeButton
              liked={liked}
              count={likesCount}
              onToggle={toggleLike}
              loading={likeLoading}
              variant="inline"
            />
            <ShareButton
              postId={post.id}
              slug={post.slug}
              title={post.title}
              text={leadText || bodyText.slice(0, 200)}
              variant="inline"
            />
            <SaveButton
              saved={saved}
              count={savesCount}
              onToggle={toggleSave}
              loading={saveLoading}
              variant="inline"
            />
            <span
              className={cn(
                'ml-auto text-sm text-[rgb(var(--color-muted))]',
                liked && 'text-red-600 dark:text-red-400'
              )}
            >
              {formatCount(Math.max(0, likesCount))} beğeni
            </span>
          </div>

          <PostComments postId={post.id} initialCount={post.commentsCount} />
        </div>
      </article>

      {/* Related articles */}
      {suggested.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-black text-[rgb(var(--color-text))]">
            İlgili Haberler
          </h2>
          <SuggestedNewsRail posts={suggested} preferSlugLinks />
        </section>
      )}
    </div>
  )
}
