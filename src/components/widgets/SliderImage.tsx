import Image from 'next/image'
import { cn } from '@/lib/utils'
import { shouldUseNextImage } from '@/lib/news/shouldUseNextImage'

interface SliderImageProps {
  src: string
  alt: string
  priority?: boolean
  className?: string
  /**
   * cover — fill fixed box (feed/slider default)
   * contain — full image inside box (article hero)
   * natural — width 100%, height auto, no crop
   */
  fit?: 'cover' | 'contain' | 'natural'
}

/** Optimized hero image for slider — works in Server and Client Components. */
export function SliderImage({
  src,
  alt,
  priority = false,
  className,
  fit = 'cover',
}: SliderImageProps) {
  const useNextImage = shouldUseNextImage(src)
  const natural = fit === 'natural'
  const objectClass = fit === 'contain' ? 'object-contain' : fit === 'cover' ? 'object-cover' : undefined

  if (useNextImage) {
    if (natural) {
      return (
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={900}
          // aspectRatio: 'auto' overrides Next.js-injected aspect-ratio:1600/900
          // so portrait / square images render at their true intrinsic ratio
          style={{ aspectRatio: 'auto' }}
          className={cn('h-auto w-full', className)}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 800px"
          quality={priority ? 75 : 65}
          priority={priority}
          fetchPriority={priority ? 'high' : 'auto'}
          loading={priority ? 'eager' : 'lazy'}
          draggable={false}
        />
      )
    }

    return (
      <Image
        src={src}
        alt={alt}
        fill
        className={cn(objectClass, className)}
        sizes="(max-width: 768px) 100vw, 1200px"
        quality={priority ? 65 : 55}
        priority={priority}
        fetchPriority={priority ? 'high' : 'auto'}
        loading={priority ? 'eager' : 'lazy'}
        draggable={false}
      />
    )
  }

  if (natural) {
    return (
      <Image
        src={src}
        alt={alt}
        width={1600}
        height={900}
        unoptimized
        style={{ aspectRatio: 'auto' }}
        fetchPriority={priority ? 'high' : 'auto'}
        loading={priority ? 'eager' : 'lazy'}
        draggable={false}
        className={cn('h-auto w-full', className)}
      />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      fetchPriority={priority ? 'high' : 'auto'}
      draggable={false}
      className={cn(objectClass, className)}
    />
  )
}
