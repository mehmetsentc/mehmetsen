/**
 * VIDEO-REEL-1: NaHaber'in ürettiği Reels videoları /video ve /reels akışında.
 *
 * Reels üretimi videoyu `news/{id}.reelVideoUrl` alanına yazar (`videoUrl`
 * SEO ve sosyal uygunluk için bilerek değiştirilmez — reelLibrary.ts). Video
 * akışı ise yalnızca `hasVideo / videoUrl / videoEmbedUrl / mediaItems`
 * alanlarını okuyordu; bu yüzden NaHaber videoları masaüstü /video sayfasında
 * hiç görünmüyor, yalnızca eski ajans (ANKA) YouTube videoları çıkıyordu.
 *
 * Bu modül saf fonksiyonlardır: haber belgesinde NaHaber Reels'i varsa akışın
 * oynatacağı video olarak onu kullanır. Haberin kendi oynatılabilir dosyası
 * (NaHaber deposundaki MP4) varsa ona dokunulmaz; YouTube / dış oynatıcı
 * bağlantısı yerine NaHaber Reels'i tercih edilir.
 */
import { isPlayableOwnedNativeUrl } from './playableVisual'

type ReelFields = {
  reelVideoUrl?: unknown
  reelCoverUrl?: unknown
  videoUrl?: unknown
  videoEmbedUrl?: unknown
  coverImageUrl?: unknown
  mediaItems?: unknown
  hasVideo?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export function nahaberReelUrl(data: ReelFields): string | null {
  const url = str(data.reelVideoUrl)
  return url && isPlayableOwnedNativeUrl(url) ? url : null
}

/** Haberin kendi videosu zaten NaHaber deposunda oynatılabilir bir dosya mı? */
function hasOwnPlayableFile(data: ReelFields): boolean {
  const urls = [str(data.videoUrl)]
  for (const m of Array.isArray(data.mediaItems) ? data.mediaItems : []) {
    const o = (m ?? {}) as { type?: unknown; url?: unknown }
    if (o.type === 'video') urls.push(str(o.url))
  }
  return urls.some((u) => !!u && isPlayableOwnedNativeUrl(u))
}

/**
 * Akış için belge: NaHaber Reels'i varsa ve haberin kendi oynatılabilir dosyası
 * yoksa videoUrl = Reels; YouTube / dış oynatıcı adayları akış kopyasından çıkarılır
 * (asıl belgeye yazılmaz).
 */
export function withNahaberReel<T extends ReelFields>(data: T): T {
  const reel = nahaberReelUrl(data)
  if (!reel || hasOwnPlayableFile(data)) return data
  const media = Array.isArray(data.mediaItems)
    ? (data.mediaItems as Array<{ type?: unknown }>).filter((m) => m?.type !== 'video')
    : data.mediaItems
  return {
    ...data,
    videoUrl: reel,
    videoEmbedUrl: '',
    mediaItems: media,
    hasVideo: true,
    coverImageUrl: str(data.coverImageUrl) || str(data.reelCoverUrl) || data.coverImageUrl,
  }
}

type Dated = { id: string; publishedAt?: string | null; createdAt?: string | null }

/** İki sayfayı tarih sırasıyla birleştirir (yeni önce), aynı haberi bir kez tutar. */
export function mergeVideoPages<T extends Dated>(primary: T[], reels: T[]): T[] {
  const t = (p: T) => Date.parse(p.publishedAt || p.createdAt || '') || 0
  const seen = new Set<string>()
  const out: T[] = []
  // Aynı haber iki sayfada da varsa Reels'li kopya (reels sayfası) kazanır.
  for (const p of [...reels, ...primary]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out.sort((a, b) => t(b) - t(a))
}
