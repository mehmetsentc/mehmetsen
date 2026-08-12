'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { ChevronRight, Clock, Hash, MapPin, User } from 'lucide-react'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import { formatCount, getArticleBylineName, getPostCoverAlt } from '@/lib/postUtils'
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
import { parseArticleContent } from '@/lib/articleBodyUtils'
import {
  useNetworkTier,
  imageQualityForTier,
  scaleSizesForTier,
} from '@/store/networkContext'

interface NewsArticleLayoutProps {
  post: Post
  suggested: Post[]
}

export function NewsArticleLayout({ post, suggested }: NewsArticleLayoutProps) {
  const tier = useNetworkTier()
  const imageUrl = post.coverImageUrl?.trim() || null
  const categoryLabel = getCategoryLabel(post.categoryId)
  const bylineName = getArticleBylineName(post)
  const publishedAt = post.publishedAt ?? post.createdAt
  const publishedLabel = publishedAt
    ? format(new Date(publishedAt), 'd MMMM yyyy, HH:mm', { locale: tr })
    : ''

  const {
    articleTitle,
    leadText,
    bodyText,
    showLead,
    hasHtmlContent,
    sanitizedHtml,
    paragraphs,
    readMinutes,
  } = parseArticleContent(post)

  const hasTags = post.tags.length > 0
  const hasCity = Boolean(post.city || post.citySlug)

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
        {/* Header */}
        <header className="border-b border-[rgb(var(--color-border))] px-4 py-6 sm:px-8 sm:py-8">
          {/* Category + Source badges */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="category">{categoryLabel}</Badge>
            {post.categoryId === 'son-dakika' && (
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
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[rgb(var(--color-meta))]">
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
            <span aria-hidden className="text-[rgb(var(--color-border))]">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {readMinutes} dk okuma
            </span>
            {/* görüntülenme sayısı kaldırıldı */}
          </div>
        </header>

        {/* Featured image — responsive hero cap, object-cover */}
        {imageUrl && (
          <figure className="news-article-hero-block relative">
            <div className="news-article-hero">
              <SafeNewsImage
                src={imageUrl}
                alt={getPostCoverAlt(post)}
                fill
                quality={imageQualityForTier(tier)}
                className="object-cover object-center"
                sizes={scaleSizesForTier('(max-width: 768px) 100vw, 768px', tier)}
                priority
              />
            </div>
          </figure>
        )}

        {/* Article body */}
        <div className="px-4 py-6 sm:px-8 sm:py-8">
          {/* Spot / Lead paragraph — journalistic 5W+H intro */}
          {showLead && (
            <blockquote className="news-lead mb-8 border-l-4 border-[rgb(var(--color-brand))] bg-[rgb(var(--color-surface-elevated))] px-5 py-4 text-lg font-medium leading-relaxed text-[rgb(var(--color-summary))] sm:text-xl not-italic">
              {leadText}
            </blockquote>
          )}

          {/* Full HTML content (extracted from source) */}
          {hasHtmlContent && sanitizedHtml && (
            <div
              className="news-body prose prose-lg max-w-none text-[rgb(var(--color-body))] [&>p]:mb-6 [&>p]:leading-[1.85] [&>p]:text-[rgb(var(--color-body))] [&>h2]:mb-4 [&>h2]:mt-8 [&>h2]:text-xl [&>h2]:font-black [&>h2]:text-[rgb(var(--color-text))] [&>h3]:mb-3 [&>h3]:mt-6 [&>h3]:text-lg [&>h3]:font-bold [&>h3]:text-[rgb(var(--color-text))] [&>ul]:mb-6 [&>ul]:list-disc [&>ul]:pl-6 [&>li]:mb-2 [&>blockquote]:border-l-4 [&>blockquote]:border-[rgb(var(--color-brand))] [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-[rgb(var(--color-body))]"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          )}

          {/* Plain text paragraphs (fallback) */}
          {!hasHtmlContent && paragraphs.length > 0 && (
            <div className="news-body space-y-6 text-[17px] leading-[1.85] tracking-[0.01em] text-[rgb(var(--color-body))] sm:text-[18px]">
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          )}

          {!showLead && !hasHtmlContent && paragraphs.length === 0 && (
            <p className="text-[rgb(var(--color-muted))]">Bu haber için içerik bulunamadı.</p>
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
                    href={ROUTES.TAG(tag)}
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
