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

/** Doğrudan görsel dosya URL'si mi? (scrap gerekmez) */
export function isDirectImageUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0]
  return /\.(jpe?g|png|gif|webp|svg|avif)$/.test(lower)
}
