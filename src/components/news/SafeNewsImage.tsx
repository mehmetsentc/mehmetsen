'use client'

import { useState } from 'react'
import Image, { type ImageProps } from 'next/image'
import { cn } from '@/lib/utils'
import { isKnownNewsImageHost } from '@/constants/imageHosts'

type SafeNewsImageProps = Omit<ImageProps, 'unoptimized'> & {
  src: string
  onLoadError?: () => void
}

function parseHostname(src: string): string | null {
  try {
    const raw = src.startsWith('//') ? `https:${src}` : src
    if (raw.startsWith('/')) return null
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Renders RSS/news thumbnails with next/image for known CDNs and falls back to
 * a native lazy-loaded <img> for unknown external hosts — prevents runtime
 * "hostname not configured" errors when a feed introduces a new image CDN.
 *
 * If the image fails to load (broken URL), calls onLoadError and hides itself.
 */
export function SafeNewsImage({ src, alt, className, fill, loading, onLoadError, ...rest }: SafeNewsImageProps) {
  const [errored, setErrored] = useState(false)
  const hostname = parseHostname(src)
  const useNextImage = !hostname || isKnownNewsImageHost(hostname)

  function handleError() {
    setErrored(true)
    onLoadError?.()
  }

  if (errored) return null

  if (useNextImage) {
    return (
      <Image
        src={src}
        alt={alt ?? ''}
        className={cn(fill && 'object-cover', className)}
        fill={fill}
        loading={loading}
        onError={handleError}
        {...rest}
      />
    )
  }

  const lazy = loading !== 'eager'

  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? ''}
        loading={lazy ? 'lazy' : 'eager'}
        decoding="async"
        className={cn('absolute inset-0 h-full w-full object-cover', className)}
        onError={handleError}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ''}
      loading={lazy ? 'lazy' : 'eager'}
      decoding="async"
      className={className}
      width={typeof rest.width === 'number' ? rest.width : undefined}
      height={typeof rest.height === 'number' ? rest.height : undefined}
      onError={handleError}
    />
  )
}
