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
}

/** Optimized hero image for slider — works in Server and Client Components. */
export function SliderImage({ src, alt, priority = false, className }: SliderImageProps) {
  const hostname = parseHostname(src)
  const useNextImage = !hostname || isKnownNewsImageHost(hostname)

  if (useNextImage) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        className={cn('object-cover', className)}
        sizes="100vw"
        priority={priority}
        fetchPriority={priority ? 'high' : 'auto'}
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
      className={cn('absolute inset-0 h-full w-full object-cover', className)}
    />
  )
}
