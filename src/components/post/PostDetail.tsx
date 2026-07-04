'use client'

import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Clapperboard, Eye, Heart, Play } from 'lucide-react'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { getPrimaryVideo, hasVideoContent, isYouTubeUrl } from '@/lib/postUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import {
  formatTimelineRelative,
  getPostTypeLabel,
  getPostTypeStyle,
} from '@/lib/timelineUtils'
import { ProfileLink } from '@/components/profile/ProfileLink'
import { LikeButton } from '@/components/post/LikeButton'
import { SaveButton } from '@/components/post/SaveButton'
import { ShareButton } from '@/components/post/ShareButton'
import { PostMoreButton } from '@/components/post/PostMoreMenu'
import { PostComments } from '@/components/post/PostComments'
import { SuggestedNewsRail } from '@/components/post/SuggestedNewsRail'
import { PostMeta } from '@/components/post/PostMeta'
import { useLike } from '@/hooks/useLike'
import { useSave } from '@/hooks/useSave'
import { formatCount, getArticleBylineName } from '@/lib/postUtils'
import { cn } from '@/lib/utils'
import {
  useNetworkTier,
  imageQualityForTier,
  scaleSizesForTier,
} from '@/store/networkContext'

/**
 * Haber içeriğini temiz paragraflara dönüştürür.
 * Sorun: Scraper bazı haberlerde isim kısaltmalarını (“P.\n\nS.\n\n,”) ayrı
 * satırlara böler. Bu helper çift-newline’ları paragraf yapar, ardından
 * tek harfli / virgül/kesme işaretiyle başlayan kısa parçacıkları önceki
 * paragrafla birleştirir.
 *
 * additionalImages parametresi ile görseller paragraflar arasına eşit
 * aralıklarla yerleştirilir.
 */
function renderNewsContent(
  raw: string,
  additionalImages?: Array<{ url: string; caption?: string }>
): React.ReactNode {
  // Çift (veya daha fazla) newline = paragraf sınırı
  const rawParts = raw.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean)

  // Kısa fragment’leri (≤6 karakter VEYA virgül/kesme ile başlayan) öncekiyle birleştir
  const merged: string[] = []
  for (const part of rawParts) {
    const prev = merged[merged.length - 1]
    const isFragment =
      part.length <= 6 ||
      /^[,’’’’’””]/.test(part)
    if (prev !== undefined && isFragment) {
      merged[merged.length - 1] = prev + part
    } else {
      merged.push(part)
    }
  }

  const imgs = additionalImages?.filter((i) => i.url) ?? []
  const nodes: React.ReactNode[] = []

  merged.forEach((para, i) => {
    nodes.push(
      <p key={`p-${i}`} className="mb-4 leading-relaxed last:mb-0">
        {para}
      </p>
    )
    // Her kaç paragrafta bir görsel göster (eşit dağılım)
    if (imgs.length > 0) {
      // Görseli yerleştireceğimiz paragraf aralıkları hesapla (en az 1 paragrafta bir)
      const step = Math.max(1, Math.floor(merged.length / (imgs.length + 1)))
      const imgIndex = Math.floor((i + 1) / step) - 1
      if ((i + 1) % step === 0 && imgIndex >= 0 && imgIndex < imgs.length) {
        const img = imgs[imgIndex]
        nodes.push(
          <figure key={`img-${imgIndex}`} className="my-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={img.caption ?? ''}
              className="w-full rounded-xl object-cover"
              loading="lazy"
            />
            {img.caption && (
              <figcaption className="mt-2 text-center text-xs text-[rgb(var(--color-muted))]">
                {img.caption}
              </figcaption>
            )}
          </figure>
        )
      }
    }
  })

  // Yerleştirilemeyen görselleri sona ekle
  if (imgs.length > 0) {
    const step = Math.max(1, Math.floor(merged.length / (imgs.length + 1)))
    const placedCount = Math.min(imgs.length, Math.floor(merged.length / step))
    imgs.slice(placedCount).forEach((img, j) => {
      nodes.push(
        <figure key={`img-tail-${j}`} className="my-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.url}
            alt={img.caption ?? ''}
            className="w-full rounded-xl object-cover"
            loading="lazy"
          />
          {img.caption && (
            <figcaption className="mt-2 text-center text-xs text-[rgb(var(--color-muted))]">
              {img.caption}
            </figcaption>
          )}
        </figure>
      )
    })
  }

  return nodes
}

interface PostDetailProps {
  post: Post
  suggested: Post[]
}

export function PostDetail({ post, suggested }: PostDetailProps) {
  const tier = useNetworkTier()
  const isVideo = hasVideoContent(post)
  const videoMedia = getPrimaryVideo(post)
  const imageUrl =
    post.coverImageUrl ||
    videoMedia?.thumbnailUrl ||
    post.mediaItems?.find((m) => m.type === 'image')?.url ||
    null
  const videoUrl = videoMedia?.url ?? null

  const publishedLabel = post.publishedAt
    ? format(new Date(post.publishedAt), 'd MMMM yyyy, HH:mm', { locale: tr })
    : ''
  const relative = formatTimelineRelative(post.publishedAt)

  const { liked, count: likesCount, toggle: toggleLike, loading: likeLoading } = useLike({
    postId: post.id,
    initialCount: post.likesCount,
  })

  const { saved, count: savesCount, toggle: toggleSave, loading: saveLoading } = useSave({
    postId: post.id,
    initialCount: post.savesCount,
  })

  return (
    <div className="w-full">
      <article className="surface-card overflow-hidden">
        <div className="border-b border-[rgb(var(--color-border))] px-4 py-4 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${getPostTypeStyle(post.postType)}`}
            >
              {getPostTypeLabel(post.postType)}
            </span>
            {post.categoryId && (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                {getCategoryLabel(post.categoryId)}
              </span>
            )}
            {isVideo && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400">
                <Clapperboard className="h-3.5 w-3.5" />
                Video
              </span>
            )}
          </div>

          <h1 className="text-xl font-black leading-tight text-[rgb(var(--color-text))] sm:text-2xl">
            {post.title}
          </h1>

          <div className="mt-2 flex justify-end">
            <PostMoreButton
              post={{
                id: post.id,
                title: post.title,
                authorUsername: post.authorUsername,
                isVideo,
                viewsCount: post.viewsCount,
                likesCount: post.likesCount,
                commentsCount: post.commentsCount,
                savesCount: post.savesCount,
              }}
              variant="detail"
              saved={saved}
              onToggleSave={toggleSave}
            />
          </div>

          <PostMeta post={post} className="mt-3" />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[rgb(var(--color-muted))]">
            <ProfileLink
              username={post.authorUsername}
              className="font-semibold text-[rgb(var(--color-text))]"
            >
              {getArticleBylineName(post)}
            </ProfileLink>
            {publishedLabel && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <time dateTime={post.publishedAt ?? post.createdAt}>{publishedLabel}</time>
              </>
            )}
            {relative && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span>{relative}</span>
              </>
            )}
            <span className="flex items-center gap-1 text-gray-400">
              <Eye className="h-3.5 w-3.5" />
              {formatCount(post.viewsCount)}
            </span>
          </div>
        </div>

        {(imageUrl || videoUrl) && (
          isVideo && videoUrl && isYouTubeUrl(videoUrl) ? (
            /* ── YouTube embed → iframe (16:9) ──────────────────────── */
            <div className="relative mx-auto w-full overflow-hidden bg-black aspect-video">
              <iframe
                src={`${videoUrl.includes('?') ? videoUrl : `${videoUrl}?`}rel=0&modestbranding=1`}
                title={post.title}
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : (
            /* ── Normal video veya görsel ────────────────────────────── */
            <div
              className={cn(
                'relative mx-auto w-full overflow-hidden bg-black',
                isVideo ? 'aspect-[9/16] max-h-[min(80dvh,960px)]' : 'aspect-video max-h-[70vh]'
              )}
            >
              {isVideo && videoUrl ? (
                <Link href={ROUTES.REELS_VIDEO(post.id)} className="group block h-full w-full">
                  <video
                    src={videoUrl}
                    poster={imageUrl ?? undefined}
                    muted
                    playsInline
                    preload={tier === 'low' ? 'none' : 'metadata'}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/40">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                      <Play className="h-7 w-7 fill-white text-white" />
                    </span>
                  </span>
                </Link>
              ) : imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={post.title}
                  fill
                  quality={imageQualityForTier(tier)}
                  className="object-cover"
                  sizes={scaleSizesForTier('(max-width: 768px) 100vw, 672px', tier)}
                  priority
                />
              ) : null}
            </div>
          )
        )}

        <div className="px-4 py-5 sm:px-6">
          {post.content && (
            <div className="prose prose-sm max-w-none text-[rgb(var(--color-text))] dark:prose-invert">
              {renderNewsContent(post.content, post.additionalImages)}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-1 border-t border-[rgb(var(--color-border))] pt-4">
            <LikeButton
              liked={liked}
              count={likesCount}
              onToggle={toggleLike}
              loading={likeLoading}
              variant="inline"
            />
            <ShareButton postId={post.id} title={post.title} variant="inline" />
            <SaveButton
              saved={saved}
              count={savesCount}
              onToggle={toggleSave}
              loading={saveLoading}
              variant="inline"
            />
            <span className="ml-auto flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <Heart className={cn('h-4 w-4', liked && 'fill-red-500 text-red-500 dark:fill-red-400 dark:text-red-400')} />
              {formatCount(likesCount)} beğeni
            </span>
          </div>

          <PostComments postId={post.id} initialCount={post.commentsCount} />
        </div>
      </article>

      <SuggestedNewsRail posts={suggested} />
    </div>
  )
}
