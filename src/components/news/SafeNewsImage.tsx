'use client'

import { useState, type CSSProperties } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { shouldUseNextImage } from '@/lib/news/shouldUseNextImage'
import { newsImageProxyPath, parsePublicImageUrl, widthHintFromSizes } from '@/lib/newsImageProxy'

type SafeNewsImageProps = {
  src: string
  /** Shown once if `src` fails (e.g. brand logo). Prevents a blank black frame. */
  fallbackSrc?: string
  alt?: string
  className?: string
  fill?: boolean
  loading?: 'lazy' | 'eager'
  sizes?: string
  width?: number | `${number}`
  height?: number | `${number}`
  priority?: boolean
  quality?: number
  fetchPriority?: 'high' | 'low' | 'auto'
  style?: CSSProperties
  onLoadError?: () => void
  onLoad?: () => void
  onError?: () => void
}

function hasObjectFitClass(className?: string): boolean {
  return Boolean(className && /\bobject-(contain|cover|fill|none|scale-down)\b/.test(className))
}

function proxiedRemote(src: string, sizes: string | undefined, priority: boolean) {
  if (!parsePublicImageUrl(src)) return null
  const width = widthHintFromSizes(sizes, Boolean(priority))
  const full = newsImageProxyPath(src, width)
  if (priority) {
    return { src: full, srcSet: undefined, sizes }
  }
  const halfW = Math.max(64, Math.round(width / 2))
  const half = newsImageProxyPath(src, halfW)
  return {
    src: full,
    srcSet: `${half} ${halfW}w, ${full} ${width}w`,
    sizes,
  }
}

/**
 * Remote RSS thumbnails must not mount `next/image` (hostname allow-list throws).
 * They go through /api/img so a 163 px card does not download a multi-megabyte PNG.
 * Only site-relative paths use next/image.
 */
export function SafeNewsImage({
  src,
  fallbackSrc,
  alt,
  className,
  fill,
  loading,
  onLoadError,
  width,
  height,
  priority,
  quality,
  sizes,
  style,
  fetchPriority,
  onLoad,
  onError,
}: SafeNewsImageProps) {
  const [errored, setErrored] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const resolvedSrc = typeof src === 'string' ? src.trim() : ''
  const resolvedFallback =
    typeof fallbackSrc === 'string' && fallbackSrc.trim() && fallbackSrc.trim() !== resolvedSrc
      ? fallbackSrc.trim()
      : ''
  const activeSrc = useFallback && resolvedFallback ? resolvedFallback : resolvedSrc

  if (errored || !activeSrc) return null

  function handleError() {
    if (!useFallback && resolvedFallback) {
      setUseFallback(true)
      return
    }
    setErrored(true)
    onLoadError?.()
    onError?.()
  }

  const numericWidth = typeof width === 'number' ? width : undefined
  const numericHeight = typeof height === 'number' ? height : undefined
  const useNextImage = shouldUseNextImage(activeSrc)
  const lazy = !priority && loading !== 'eager'
  const resolvedFetchPriority = fetchPriority ?? (priority ? 'high' : 'auto')
  const proxy = !useNextImage ? proxiedRemote(activeSrc, sizes, Boolean(priority)) : null
  const imgSrc = proxy?.src ?? activeSrc

  if (!useNextImage) {
    if (fill) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          srcSet={proxy?.srcSet}
          sizes={proxy?.sizes}
          alt={alt ?? ''}
          loading={lazy ? 'lazy' : 'eager'}
          fetchPriority={resolvedFetchPriority}
          decoding={priority ? 'sync' : 'async'}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          className={cn(
            'absolute inset-0 h-full w-full object-center',
            !hasObjectFitClass(className) && 'object-cover',
            className
          )}
          style={style}
          onLoad={onLoad}
          onError={handleError}
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
        fetchPriority={resolvedFetchPriority}
        decoding={priority ? 'sync' : 'async'}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        className={className}
        width={numericWidth ?? 96}
        height={numericHeight ?? 64}
        style={style}
        onLoad={onLoad}
        onError={handleError}
      />
    )
  }

  return (
    <Image
      key={activeSrc}
      src={activeSrc}
      alt={alt ?? ''}
      className={cn(fill && !hasObjectFitClass(className) && 'object-cover', className)}
      fill={fill}
      width={fill ? undefined : numericWidth ?? 96}
      height={fill ? undefined : numericHeight ?? 64}
      sizes={sizes}
      priority={priority}
      quality={quality}
      loading={loading}
      fetchPriority={fetchPriority}
      style={style}
      onLoad={onLoad}
      onError={handleError}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
