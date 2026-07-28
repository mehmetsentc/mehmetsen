/**
 * Admin client helper — URL'den video scrap (YouTube, sayfa, MP4…).
 */
import { auth } from '@/lib/firebase/auth'
import { isDirectImageUrl, isLikelyVideoUrl } from '@/lib/adminMediaUrlDetect'

export type { } // keep file as module
export { isDirectImageUrl, isLikelyVideoUrl }

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
