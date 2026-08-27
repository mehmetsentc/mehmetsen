import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { format, isValid } from 'date-fns'
import { tr } from 'date-fns/locale'
import { ChevronRight, Clock, Hash, MapPin, User } from 'lucide-react'
import type { MediaItem, Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import { getArticleBylineName, getPostCoverAlt, getPostPublicSource, formatPublicSourceLabel } from '@/lib/postUtils'
import { formatTagLabel } from '@/lib/tags'
import { cityCategoryId } from '@/lib/location'
import { parseArticleContent } from '@/lib/articleBodyUtils'
import { filterBodyBlocksForArticleDisplay } from '@/lib/articleBlocksFromAi'
import { planMediaPlacement } from '@/lib/mediaPlacement'
import { isEmbedPlayerUrl } from '@/lib/videoEmbed'
import { SliderImage } from '@/components/widgets/SliderImage'
import { ArticleAuthorBox } from '@/components/news/ArticleAuthorBox'
import { ArticleAudioPlayer } from '@/components/news/ArticleAudioPlayer'
import { ArticleGallery } from '@/components/news/ArticleGallery'
import { ArticleBlocksRenderer } from '@/components/news/ArticleBlocksRenderer'
import { ArticleRelatedGridStatic } from '@/components/news/ArticleRelatedGridStatic'
import { ArticleRelatedLinks } from '@/components/news/ArticleRelatedLinks'
import { InfographicBlock } from '@/components/news/InfographicBlock'
import { NewsArticleBody, NewsArticleCard, NewsArticlePage } from '@/components/news/NewsArticlePage'
import { NewsletterSignup } from '@/components/newsletter/NewsletterSignup'
import type { ArticleSeoContext } from '@/lib/seo/articleSeoTypes'
import { splitBlocksForMidAd } from '@/lib/publisher/articleAdPlacements'
import {
  PublisherVideoPrerollPlayer,
} from '@/components/publisher/PublisherVideoPrerollPlayer'
import type { PublisherAdViewModel } from '@/components/publisher/PublisherAdRenderer'
import { isPublisherVideoPrerollEnabled } from '@/lib/publisher/selfManagedAdFlags'

interface NewsArticleStaticProps {
  post: Post
  relatedPosts?: Post[]
  /** Optional SEO internal-link context (publisher / event). Same contract as getArticleSeoContext. */
  seoContext?: ArticleSeoContext | null
  /** P8/P10 article ad slots — never included in JSON-LD. */
  adSlots?: { before?: ReactNode; mid?: ReactNode; after?: ReactNode } | null
  /** P10 video pre-roll creative (null → no preroll). */
  prerollAd?: PublisherAdViewModel | null
}

/** YouTube veya embed / MP4 hero player — optional P10 pre-roll for non-embed MP4. */
function VideoHero({
  item,
  title,
  posterFallback,
  prerollAd,
}: {
  item: MediaItem
  title: string
  posterFallback: string | null
  prerollAd?: PublisherAdViewModel | null
}) {
  const isEmbed = isEmbedPlayerUrl(item.url)
  const prerollEnabled = isPublisherVideoPrerollEnabled()

  if (!isEmbed && prerollEnabled) {
    return (
      <figure className="news-article-hero-block relative">
        <PublisherVideoPrerollPlayer
          contentUrl={item.url}
          contentPoster={item.thumbnailUrl ?? posterFallback}
          contentTitle={title}
          isEmbed={false}
          ad={prerollAd ?? null}
          enabled={prerollEnabled}
        />
        {(item.caption || item.credit) && (
          <figcaption className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-2 text-xs text-[rgb(var(--color-muted))]">
            {item.caption}
            {item.caption && item.credit && <span className="mx-1">·</span>}
            {item.credit && <span className="font-medium">{item.credit}</span>}
          </figcaption>
        )}
      </figure>
    )
  }

  return (
    <figure className="news-article-hero-block relative">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-black">
        {isEmbed ? (
          <iframe
            src={item.url.includes('?') ? `${item.url}&playsinline=1` : `${item.url}?rel=0&modestbranding=1&playsinline=1`}
            title={title}
            className="absolute inset-0 h-full w-full border-0"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={item.url}
            poster={item.thumbnailUrl ?? posterFallback ?? undefined}
            controls
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
        <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-black/25 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white/65">
          nahaber.com
        </span>
      </div>
      {(item.caption || item.credit) && (
        <figcaption className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-2 text-xs text-[rgb(var(--color-muted))]">
          {item.caption}
          {item.caption && item.credit && <span className="mx-1">·</span>}
          {item.credit && <span className="font-medium">{item.credit}</span>}
        </figcaption>
      )}
    </figure>
  )
}

/** Hero görsel — doğal oran, orijinal boyut korunur, platform başına max-height CSS ile kısıtlanır. */
function ImageHero({ item, title }: { item: MediaItem; title: string }) {
  return (
    <figure className="news-article-hero-block relative">
      <div className="news-article-hero">
        <SliderImage
          src={item.url}
          alt={item.alt ?? item.caption ?? title}
          priority
          fit="natural"
        />
        <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white/70">
          nahaber.com
        </span>
      </div>
      {(item.caption || item.credit) && (
        <figcaption className="py-2 text-xs text-[rgb(var(--color-muted))]">
          {item.caption}
          {item.caption && item.credit && <span className="mx-1">·</span>}
          {item.credit && <span className="font-medium">{item.credit}</span>}
        </figcaption>
      )}
    </figure>
  )
}

/** Paragraf araları için inline görsel — doğal oran, kırpma yok. */
function InlineImage({ item, title }: { item: MediaItem; title: string }) {
  return (
    <figure className="my-7 -mx-4 overflow-hidden sm:mx-0 sm:rounded-xl">
      <div className="w-full overflow-hidden bg-[rgb(var(--color-surface))]">
        <SliderImage src={item.url} alt={item.alt ?? item.caption ?? title} fit="natural" />
      </div>
      {(item.caption || item.credit) && (
        <figcaption className="px-4 py-2 text-[13px] text-[rgb(var(--color-muted))] sm:px-3">
          {item.caption}
          {item.caption && item.credit && <span className="mx-1">·</span>}
          {item.credit && <span className="font-medium">{item.credit}</span>}
        </figcaption>
      )}
    </figure>
  )
}

/** Server-rendered article — crawlable before client JS. */
export function NewsArticleStatic({
  post,
  relatedPosts = [],
  seoContext = null,
  adSlots = null,
  prerollAd = null,
}: NewsArticleStaticProps) {
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
  const publicSource = getPostPublicSource(post)
  const hasTags = post.tags.length > 0
  const hasCity = Boolean(post.city || post.citySlug)
  const hasBodyBlocks = Boolean(post.bodyBlocks && post.bodyBlocks.length > 0)

  const coverAlt = getPostCoverAlt(post)
  const displayBodyBlocks = hasBodyBlocks
    ? filterBodyBlocksForArticleDisplay(post.bodyBlocks!, {
        title: post.title,
        spot: post.spot,
        summary: post.summary,
        coverImageUrl: post.coverImageUrl ?? undefined,
      })
    : []

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
    <NewsArticlePage id="news-article-static" articleId={post.id}>
      <nav aria-label="Breadcrumb" className="news-article-breadcrumb mb-3 hidden text-sm text-[rgb(var(--color-muted))] sm:mb-4 sm:block">
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

      <NewsArticleCard>
        <header className="news-article-header">
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

          <h1 className="news-article-title font-serif font-black text-[rgb(var(--color-text))]">
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
          </div>
        </header>

        {/* ── Hero (video varsa video, yoksa ilk görsel) ─────────────── */}
        {(() => {
          const placement = planMediaPlacement(post.mediaItems, paragraphs.length)
          if (placement.hero?.type === 'video') {
            return (
              <VideoHero
                item={placement.hero}
                title={post.title}
                posterFallback={imageUrl}
                prerollAd={prerollAd}
              />
            )
          }
          if (placement.hero?.type === 'image') {
            return <ImageHero item={placement.hero} title={coverAlt} />
          }
          return null
        })()}

        <NewsArticleBody>
          <ArticleAudioPlayer post={post} />

          {showLead && (
            <p className="news-lead mb-8 border-l-4 border-[rgb(var(--color-brand))] bg-[rgb(var(--color-surface))] px-5 py-4 text-lg font-medium leading-relaxed text-[rgb(var(--color-text))] sm:text-xl">
              {leadText}
            </p>
          )}

          {adSlots?.before ?? null}

          {post.infographic && post.infographic.stats.length > 0 ? (
            <InfographicBlock
              title={post.infographic.title}
              stats={post.infographic.stats}
              source={formatPublicSourceLabel(post.infographic.source) || undefined}
            />
          ) : null}

          {hasBodyBlocks && displayBodyBlocks.length > 0 && (() => {
            if (!adSlots?.mid) {
              return (
                <ArticleBlocksRenderer
                  blocks={displayBodyBlocks}
                  title={post.title}
                  longform={post.articleLayout === 'longform'}
                />
              )
            }
            const { before, after } = splitBlocksForMidAd(displayBodyBlocks)
            return (
              <>
                {before.length > 0 ? (
                  <ArticleBlocksRenderer
                    blocks={before}
                    title={post.title}
                    longform={post.articleLayout === 'longform'}
                  />
                ) : null}
                {adSlots.mid}
                {after.length > 0 ? (
                  <ArticleBlocksRenderer
                    blocks={after}
                    title={post.title}
                    longform={post.articleLayout === 'longform'}
                  />
                ) : null}
              </>
            )
          })()}

          {!hasBodyBlocks && hasHtmlContent && sanitizedHtml && (
            <>
              <div
                className="article-prose news-body prose prose-lg prose-invert max-w-none text-[rgb(var(--color-text))]"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
              {adSlots?.mid ?? null}
            </>
          )}

          {!hasBodyBlocks && !hasHtmlContent && paragraphs.length > 0 && (() => {
            const placement = planMediaPlacement(post.mediaItems, paragraphs.length)
            const midAt = adSlots?.mid ? Math.max(1, Math.floor(paragraphs.length * 0.35)) : null
            return (
              <div className="article-prose news-body space-y-6 text-[17px] leading-[1.85] text-[rgb(var(--color-text))] sm:text-[18px]">
                {paragraphs.map((paragraph, index) => {
                  const inline = placement.inlineAfter.get(index)
                  return (
                    <Fragment key={index}>
                      <p>{paragraph}</p>
                      {inline && <InlineImage item={inline} title={post.title} />}
                      {midAt != null && index === midAt - 1 ? adSlots?.mid : null}
                    </Fragment>
                  )
                })}
                {placement.trailing.length > 0 && (
                  <div className="mt-2">
                    <ArticleGallery items={placement.trailing} title={post.title} />
                  </div>
                )}
              </div>
            )
          })()}

          {adSlots?.after ?? null}

          {/* HTML content modunda inline yerleştirme zor — paragraflar tek string olarak gelir.
              Bu nedenle ekstra görseller HTML body'nin altında bir galeri olarak gösterilir. */}
          {!hasBodyBlocks && hasHtmlContent && post.mediaItems && post.mediaItems.filter((m, i) => i > 0 && m.type === 'image').length > 0 && (
            <div className="mt-6">
              <ArticleGallery
                items={post.mediaItems.filter((m, i) => i > 0 && m.type === 'image')}
                title={post.title}
              />
            </div>
          )}

          {!showLead && !hasBodyBlocks && !hasHtmlContent && paragraphs.length === 0 && (
            <p className="text-[rgb(var(--color-muted))]">Bu haber için içerik bulunamadı.</p>
          )}

          <ArticleAuthorBox post={post} />

          <NewsletterSignup source="article" variant="inline" className="mt-6 sm:mt-8" />

          <ArticleRelatedGridStatic posts={relatedPosts} />

          <ArticleRelatedLinks
            post={post}
            context={{
              publisher: seoContext?.publisher ?? null,
              event: seoContext?.event ?? null,
              relatedPosts,
            }}
          />

          {/* Kaynak satırı */}
          {(publicSource || post.sourceUrl) && (
            <div className="mt-6 border-t border-[rgb(var(--color-border))] pt-4 text-sm text-[rgb(var(--color-muted))]">
              <span className="font-semibold">Kaynak: </span>
              {post.sourceUrl ? (
                <a
                  href={post.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline hover:text-[rgb(var(--color-text))]"
                >
                  {publicSource || new URL(post.sourceUrl).hostname.replace(/^www\./, '')}
                </a>
              ) : (
                <span>{publicSource}</span>
              )}
            </div>
          )}

          {(hasTags || hasCity) && (
            <section aria-label="Etiketler" className="mt-5 sm:mt-6">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                Etiketler
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {hasCity && post.citySlug && (
                  <Link
                    href={`${ROUTES.FEED}?category=${encodeURIComponent(cityCategoryId(post.citySlug))}`}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-400"
                  >
                    <MapPin className="h-3 w-3" />
                    {post.city ?? post.citySlug}
                  </Link>
                )}
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={ROUTES.TAG(tag)}
                    className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--color-surface))] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--color-brand))] ring-1 ring-[rgb(var(--color-border))]"
                  >
                    <Hash className="h-3 w-3" />
                    {formatTagLabel(tag).slice(1)}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </NewsArticleBody>
      </NewsArticleCard>
    </NewsArticlePage>
  )
}
