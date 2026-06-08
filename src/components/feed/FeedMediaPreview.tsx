'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useNetworkTier,
  imageQualityForTier,
  scaleSizesForTier,
  videoPreloadForTier,
} from '@/store/networkContext'

interface FeedMediaPreviewProps {
  href: string
  isVideo: boolean
  imageUrl?: string | null
  videoUrl?: string | null
  layout: 'thumb' | 'banner'
  className?: string
}

export function FeedMediaPreview({
  href,
  isVideo,
  imageUrl,
  videoUrl,
  layout,
  className,
}: FeedMediaPreviewProps) {
  const tier = useNetworkTier()
  const hasImage = Boolean(imageUrl?.trim())
  const hasVideo = Boolean(isVideo && videoUrl?.trim())

  if (!hasImage && !hasVideo) return null

  const isThumb = layout === 'thumb'

  return (
    <Link
      href={href}
      className={cn(
        'group/media relative overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800',
        isThumb ? 'timeline-thumb hidden shrink-0 sm:block' : 'mt-3 block aspect-[16/9] sm:hidden',
        className
      )}
    >
      {hasVideo ? (
        <video
          src={videoUrl!}
          poster={hasImage ? imageUrl! : undefined}
          muted
          playsInline
          preload={videoPreloadForTier(tier, false)}
          className="h-full w-full object-cover transition-transform group-hover/media:scale-105"
        />
      ) : (
        <SafeNewsImage
          src={imageUrl!}
          alt=""
          fill
          loading="lazy"
          quality={imageQualityForTier(tier)}
          className="object-cover transition-transform group-hover/media:scale-105"
          sizes={scaleSizesForTier(isThumb ? '(max-width: 768px) 80px, 120px' : '100vw', tier)}
        />
      )}

      {isVideo && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <Play className="h-5 w-5 fill-white text-white" />
          </span>
        </span>
      )}
    </Link>
  )
}
