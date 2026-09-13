import { parseYouTubeVideoId } from '@/lib/postUtils'
import type { VideoMetadata } from '@/video/domain/types'
import { parseHttpUrl } from '@/video/metadata/normalizeUrl'
import type { VideoProvider } from './types'

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

type OembedPayload = {
  title?: string
  author_name?: string
  author_url?: string
  thumbnail_url?: string
  width?: number
  height?: number
}

export function createYoutubeProvider(deps?: {
  fetchOembed?: (watchUrl: string) => Promise<OembedPayload | null>
}): VideoProvider {
  const fetchOembed =
    deps?.fetchOembed ??
    (async (watchUrl: string) => {
      try {
        const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`
        const res = await fetch(endpoint, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8_000),
        })
        if (!res.ok) return null
        return (await res.json()) as OembedPayload
      } catch {
        return null
      }
    })

  return {
    platform: 'youtube',
    supports(url) {
      return Boolean(parseYouTubeVideoId(url))
    },
    async normalizeUrl(url) {
      const id = parseYouTubeVideoId(url)
      if (!id) {
        const parsed = parseHttpUrl(url)
        if (!parsed) throw new Error('INVALID_URL')
        return parsed.href
      }
      return youtubeWatchUrl(id)
    },
    async getMetadata(url) {
      const id = parseYouTubeVideoId(url)
      if (!id) throw new Error('UNSUPPORTED_URL')
      const normalizedUrl = youtubeWatchUrl(id)
      const oembed = await fetchOembed(normalizedUrl)
      const width = oembed?.width ?? null
      const height = oembed?.height ?? null
      const metadata: VideoMetadata = {
        platform: 'youtube',
        platformVideoId: id,
        originalUrl: url.trim(),
        normalizedUrl,
        title: oembed?.title?.trim() || null,
        description: null,
        durationMs: null,
        width,
        height,
        aspectRatio: width && height ? `${width}:${height}` : '16:9',
        thumbnailUrl: oembed?.thumbnail_url || youtubeThumbnailUrl(id),
        publishedAt: null,
        source: {
          sourceProfileId: null,
          sourceUsername: oembed?.author_name ?? null,
          sourceName: oembed?.author_name ?? null,
          sourceUrl: oembed?.author_url ?? null,
        },
      }
      return metadata
    },
  }
}

export const youtubeProvider = createYoutubeProvider()
