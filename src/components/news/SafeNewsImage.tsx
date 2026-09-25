'use client'

import { useState } from 'react'
import Image, { type ImageProps } from 'next/image'
import { cn } from '@/lib/utils'
import { isKnownNewsImageHost } from '@/constants/imageHosts'
import { newsImageProxyPath, parsePublicImageUrl, widthHintFromSizes } from '@/lib/newsImageProxy'

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

function hasObjectFitClass(className?: string): boolean {
  return Boolean(className && /\bobject-(contain|cover|fill|none|scale-down)\b/.test(className))
}

/**
 * Renders RSS/news thumbnails with next/image for known CDNs and falls back to
 * a native lazy-loaded <img> for unknown external hosts — prevents runtime
 * "hostname not configured" errors when a feed introduces a new image CDN.
 *
 * If the image fails to load (broken URL), calls onLoadError and hides itself.
 */
export function SafeNewsImage({
  src,
  alt,
  className,
  fill,
  loading,
  onLoadError,
  onError,
  onLoad,
  ...rest
}: SafeNewsImageProps) {
  const [errored, setErrored] = useState(false)
  const hostname = parseHostname(src)
  const useNextImage = !hostname || isKnownNewsImageHost(hostname)

  const fetchPri = (rest as Record<string, unknown>).fetchPriority as
    | 'high'
    | 'low'
    | 'auto'
    | undefined
  const isPriority = Boolean(rest.priority)

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
        className={cn(fill && !hasObjectFitClass(className) && 'object-cover', className)}
        fill={fill}
        loading={loading}
        onError={handleError}
        {...rest}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
      />
    )
  }

  const lazy = !isPriority && loading !== 'eager'
  const proxy =
    parsePublicImageUrl(src) != null
      ? (() => {
          const width = widthHintFromSizes(rest.sizes, isPriority)
          const full = newsImageProxyPath(src, width)
          const halfW = Math.max(64, Math.round(width / 2))
          const half = newsImageProxyPath(src, halfW)
          return {
            src: full,
            srcSet: `${half} ${halfW}w, ${full} ${width}w`,
            sizes: typeof rest.sizes === 'string' ? rest.sizes : undefined,
          }
        })()
      : null
  const imgSrc = proxy?.src ?? src

  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imgSrc}
        srcSet={proxy?.srcSet}
        sizes={proxy?.sizes}
        alt={alt ?? ''}
        loading={lazy ? 'lazy' : 'eager'}
        fetchPriority={fetchPri ?? (isPriority ? 'high' : 'auto')}
        decoding={isPriority ? 'sync' : 'async'}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          'absolute inset-0 h-full w-full object-center',
          !hasObjectFitClass(className) && 'object-cover',
          className
        )}
        onLoad={onLoad}
        onError={(event) => {
          handleError()
          onError?.(event as Parameters<NonNullable<ImageProps['onError']>>[0])
        }}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      srcSet={proxy?.srcSet}
      sizes={proxy?.sizes}
      alt={alt ?? ''}
      loading={lazy ? 'lazy' : 'eager'}
      fetchPriority={fetchPri ?? (isPriority ? 'high' : 'auto')}
      decoding={isPriority ? 'sync' : 'async'}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      className={className}
      width={typeof rest.width === 'number' ? rest.width : undefined}
      height={typeof rest.height === 'number' ? rest.height : undefined}
      onLoad={onLoad}
      onError={(event) => {
        handleError()
        onError?.(event as Parameters<NonNullable<ImageProps['onError']>>[0])
      }}
    />
  )
}
