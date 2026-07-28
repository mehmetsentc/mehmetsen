/**
 * URL kind heuristics for CMS media scrap (no Firebase imports).
 */

/** Doğrudan / CDN görsel URL'si mi? (uzantısız Google tbn dahil) */
export function isDirectImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    const search = parsed.search.toLowerCase()

    if (/\.(jpe?g|png|gif|webp|svg|avif)$/.test(path)) return true

    if (
      host.includes('gstatic.com') ||
      host.includes('googleusercontent.com') ||
      host.includes('ggpht.com') ||
      (host.includes('google.com') && path.includes('/images')) ||
      host.includes('twimg.com') ||
      host.includes('fbcdn.net') ||
      host.includes('cdninstagram.com') ||
      host.includes('pinimg.com') ||
      host.includes('imgur.com') ||
      host.includes('cloudinary.com') ||
      host.includes('imgix.net') ||
      host.includes('unsplash.com') ||
      host.includes('pexels.com')
    ) {
      if (host.includes('youtube.com') || host.includes('youtu.be')) return false
      return true
    }

    if (/[?&](format|fm|type)=(jpe?g|png|gif|webp|avif|svg)/i.test(search)) return true
    if (/[?&]q=tbn:/i.test(search)) return true

    return false
  } catch {
    const lower = url.toLowerCase().split('?')[0] ?? ''
    return /\.(jpe?g|png|gif|webp|svg|avif)$/.test(lower)
  }
}

export function isLikelyVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    if (host.includes('youtube.com') || host.includes('youtu.be') || host.includes('vimeo.com')) {
      return true
    }
    return /\.(mp4|webm|mov|m4v)$/.test(path)
  } catch {
    return /\.(mp4|webm|mov|m4v)$/i.test(url)
  }
}
