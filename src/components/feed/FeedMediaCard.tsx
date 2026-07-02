'use client'

import { memo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FEED_FALLBACK_LOGO,
  getCategoryFallbackGradient,
} from '@/lib/feedMediaUtils'
import {
  useNetworkTier,
  imageQualityForTier,
  scaleSizesForTier,
  videoPreloadForTier,
} from '@/store/networkContext'
import { isYouTubeUrl } from '@/lib/postUtils'

interface FeedMediaCardProps {
  href: string
  title: string
  isVideo: boolean
  imageUrl?: string | null
  videoUrl?: string | null
  categoryLabel?: string | null
  categoryId?: string | null
  cityName?: string | null
  isFallbackImage?: boolean
  className?: string
}

function FeedMediaCardInner({
  href,
  title,
  isVideo,
  imageUrl,
  videoUrl,
  categoryLabel,
  categoryId,
  cityName,
  isFallbackImage = false,
  className,
}: FeedMediaCardProps) {
  const [imgErrored, setImgErrored] = useState(false)
  const tier = useNetworkTier()
  // YouTube URL'leri <video> tag'ı ile oynatılamaz — iframe gerektirir.
  // Feed kartında YouTube varsa thumbnail göster, detail sayfası iframe'i oynatır.
  const hasNativeVideo = Boolean(isVideo && videoUrl?.trim() && !isYouTubeUrl(videoUrl))
  const displayImage = (!imgErrored && imageUrl?.trim()) || FEED_FALLBACK_LOGO
  const effectiveFallback = isFallbackImage || imgErrored || !imageUrl?.trim()
  const fallbackGradient = getCategoryFallbackGradient(categoryId)

  return (
    <Link
      href={href}
      prefetch
      className={cn(
        'feed-media-card group block',
        isVideo ? 'feed-media-card-video' : 'feed-media-card-photo',
        isFallbackImage && 'feed-media-card-fallback-image',
        className
      )}
    >
      <div className="feed-media-card-media">
        {hasNativeVideo ? (
          <video
            src={videoUrl!}
            poster={!isFallbackImage ? displayImage : undefined}
            muted
            playsInline
            preload={videoPreloadForTier(tier, false)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : effectiveFallback ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${fallbackGradient} 0%, #111827 100%)`,
            }}
          >
            <Image
              src={FEED_FALLBACK_LOGO}
              alt=""
              width={120}
              height={120}
              className="h-16 w-auto opacity-90 drop-shadow-lg sm:h-20"
            />
          </div>
        ) : (
          <SafeNewsImage
            src={displayImage}
            alt=""
            fill
            loading="lazy"
            quality={imageQualityForTier(tier)}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            sizes={scaleSizesForTier('(max-width: 768px) 100vw, 720px', tier)}
            onLoadError={() => setImgErrored(true)}
          />
        )}

        {categoryLabel && (
          <span className="feed-media-card-badge">{categoryLabel}</span>
        )}

        {cityName && (
          <span className="feed-media-card-city">{cityName}</span>
        )}

        {isVideo && (
          <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
              <Play className="h-7 w-7 fill-white text-white" />
            </span>
          </span>
        )}

        <div className="feed-media-card-shade" aria-hidden />
        <div className="feed-media-card-overlay pointer-events-none">
          <h2 className="feed-media-headline">{title}</h2>
        </div>
      </div>
    </Link>
  )
}

export const FeedMediaCard = memo(FeedMediaCardInner)
