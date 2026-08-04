import Image from 'next/image'
import { isKnownNewsImageHost } from '@/constants/imageHosts'
import { cn } from '@/lib/utils'

function parseHostname(src: string): string | null {
  try {
    const raw = src.startsWith('//') ? `https:${src}` : src
    if (raw.startsWith('/')) return null
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
}

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
  const hostname = parseHostname(src)
  const useNextImage = !hostname || isKnownNewsImageHost(hostname)
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
          className={cn('h-auto w-full', className)}
          sizes="(max-width: 768px) 100vw, 1200px"
          quality={priority ? 65 : 55}
          priority={priority}
          fetchPriority={priority ? 'high' : 'auto'}
          loading={priority ? 'eager' : 'lazy'}
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
      />
    )
  }

  if (natural) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className={cn('h-auto w-full', className)}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={cn('absolute inset-0 h-full w-full', objectClass, className)}
    />
  )
}
