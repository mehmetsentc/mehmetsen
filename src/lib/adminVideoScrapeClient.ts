/**
 * Admin client helper — URL'den video scrap (YouTube, sayfa, MP4…).
 */
import { auth } from '@/lib/firebase/auth'

export interface ScrapedVideoClient {
  provider: string
  playUrl: string
  watchUrl: string
  embedUrl: string | null
  thumbnailUrl: string | null
  title: string | null
  downloadable: boolean
  source: string
}

export async function scrapeVideoUrl(
  url: string,
  opts?: { download?: boolean }
): Promise<ScrapedVideoClient> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Giriş gerekli')

  const res = await fetch('/api/admin/media/scrape-video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url: url.trim(), download: opts?.download ?? true }),
  })

  const data = (await res.json()) as ScrapedVideoClient & { error?: string }
  if (!res.ok || !data.playUrl) {
    throw new Error(data.error ?? 'Video alınamadı')
  }
  return data
}

/** Storage'a görsel/video import — Content-Type ile uzantısız CDN URL'lerini de çözer. */
export async function importMediaFromUrl(
  url: string
): Promise<{ url: string; type: 'image' | 'video' }> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Giriş gerekli')

  const res = await fetch('/api/admin/media/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url: url.trim() }),
  })
  const data = (await res.json()) as { url?: string; type?: string; error?: string }
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? 'Medya yüklenemedi')
  }
  return {
    url: data.url,
    type: data.type === 'video' ? 'video' : 'image',
  }
}

/**
 * Doğrudan görsel URL'si mi?
 * Uzantısız CDN'ler (Google tbn, googleusercontent, …) de görsel sayılır —
 * aksi halde video scrap'e düşüp hata verirler.
 */
export function isDirectImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    const search = parsed.search.toLowerCase()

    if (/\.(jpe?g|png|gif|webp|svg|avif)$/.test(path)) return true

    // Google / CDN thumbnail & image hosts (path often `/images` with no extension)
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
      // Exclude obvious non-image Google paths
      if (host.includes('youtube.com') || host.includes('youtu.be')) return false
      return true
    }

    // format=jpg / fm=webp query style CDNs
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
