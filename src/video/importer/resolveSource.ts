import type { VideoLibraryItem } from '@/video/domain/types'
import type { ImportSource } from './types'

const DIRECT_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i

const UNSUPPORTED: Record<string, ImportSource> = {
  youtube: {
    ok: false,
    code: 'YOUTUBE_NOT_DIRECT_MEDIA',
    message: 'YouTube dosya indirme bu fazda yok. Doğrudan MP4/WebM URL kullanın.',
  },
  instagram: {
    ok: false,
    code: 'PLATFORM_METADATA_ONLY',
    message: 'Instagram import bu fazda desteklenmiyor.',
  },
  tiktok: {
    ok: false,
    code: 'PLATFORM_METADATA_ONLY',
    message: 'TikTok import bu fazda desteklenmiyor.',
  },
  x: {
    ok: false,
    code: 'PLATFORM_METADATA_ONLY',
    message: 'X import bu fazda desteklenmiyor.',
  },
  facebook: {
    ok: false,
    code: 'PLATFORM_METADATA_ONLY',
    message: 'Facebook import bu fazda desteklenmiyor.',
  },
}

export function extFromUrl(url: string): string | null {
  const match = url.match(DIRECT_EXT)
  return match ? match[1].toLowerCase() : null
}

export function resolveImportSource(item: Pick<VideoLibraryItem, 'platform' | 'originalUrl' | 'normalizedUrl'>): ImportSource {
  const blocked = UNSUPPORTED[item.platform]
  if (blocked) return blocked

  const candidate = item.normalizedUrl || item.originalUrl
  const ext = extFromUrl(candidate) || extFromUrl(item.originalUrl)
  if (!ext) {
    return {
      ok: false,
      code: 'NOT_DIRECT_MEDIA',
      message: 'Yalnızca doğrudan video dosyası (mp4, webm, mov, m4v) içe aktarılır.',
    }
  }
  return { ok: true, downloadUrl: candidate, suggestedExt: ext }
}
