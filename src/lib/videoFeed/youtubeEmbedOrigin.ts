const YOUTUBE_ORIGIN_FALLBACK = 'https://www.nahaber.com'

/**
 * YouTube IFrame API `origin` must match the parent page.
 * Hardcoding nahaber.com breaks commands on www / vercel.app — pause and
 * unMute are silently ignored while the embed keeps autoplaying muted.
 * Non-http(s) origins (Capacitor) stay on the public site origin.
 */
export function youtubeEmbedParentOrigin(rawOrigin?: string | null): string {
  const origin =
    rawOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  if (!origin) return YOUTUBE_ORIGIN_FALLBACK
  try {
    const url = new URL(origin)
    if (url.protocol === 'https:' || url.protocol === 'http:') return origin
  } catch {
    /* ignore */
  }
  return YOUTUBE_ORIGIN_FALLBACK
}

export function youtubeEmbedSrc(videoId: string, origin: string): string {
  const safeId = encodeURIComponent(videoId)
  const safeOrigin = encodeURIComponent(origin)
  return `https://www.youtube-nocookie.com/embed/${safeId}?autoplay=1&mute=1&loop=1&playlist=${safeId}&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&controls=0&origin=${safeOrigin}`
}
