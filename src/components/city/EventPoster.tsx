'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Event poster from /api/events/image (next/image rejects that URL). A poster
 * that fails to load is removed so the tile falls back to its plain surface
 * instead of a broken-image box. The mount check covers failures that
 * happened before hydration attached onError.
 */
export function EventPoster({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const img = ref.current
    if (img && img.complete && img.naturalWidth === 0) setFailed(true)
  }, [src])

  if (failed) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  )
}
