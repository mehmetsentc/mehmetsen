'use client'

import { useState, type CSSProperties } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

type SafeNewsImageProps = {
  src: string
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
}

function hasObjectFitClass(className?: string): boolean {
  return Boolean(className && /\bobject-(contain|cover|fill|none|scale-down)\b/.test(className))
}

/**
 * Remote RSS thumbnails must not go through next/image defaultLoader.
 * That loader throws during render (E231) for any hostname missing from
 * remotePatterns. Live feed CDNs cannot stay synced with that list, and in
 * this Next 15.5 webpack/dev runtime a native <img> is still attributed to
 * the same defaultLoader check. `unoptimized` skips the loader entirely.
 */
export function SafeNewsImage({
  src,
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
}: SafeNewsImageProps) {
  const [errored, setErrored] = useState(false)
  const resolvedSrc = typeof src === 'string' ? src.trim() : ''

  if (errored || !resolvedSrc) return null

  function handleError() {
    setErrored(true)
    onLoadError?.()
  }

  const numericWidth = typeof width === 'number' ? width : undefined
  const numericHeight = typeof height === 'number' ? height : undefined

  return (
    <Image
      src={resolvedSrc}
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
      unoptimized
      style={style}
      onError={handleError}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
