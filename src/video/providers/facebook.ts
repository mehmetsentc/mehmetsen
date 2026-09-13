import type { VideoMetadata } from '@/video/domain/types'
import { hostWithoutWww, parseHttpUrl, stripTrackingParams } from '@/video/metadata/normalizeUrl'
import type { VideoProvider } from './types'

function facebookVideoId(url: string): string | null {
  const parsed = parseHttpUrl(url)
  if (!parsed) return null
  const host = hostWithoutWww(parsed.hostname)
  if (
    host !== 'facebook.com' &&
    host !== 'fb.watch' &&
    host !== 'fb.com' &&
    host !== 'm.facebook.com'
  ) {
    return null
  }
  stripTrackingParams(parsed)
  const watch = parsed.searchParams.get('v')
  if (watch) return watch
  const reel = parsed.pathname.match(/\/(reel|videos)\/(\d+)/i)
  if (reel) return reel[2]
  if (host === 'fb.watch') {
    const short = parsed.pathname.replace(/\//g, '').trim()
    return short || null
  }
  return null
}

export const facebookProvider: VideoProvider = {
  platform: 'facebook',
  supports(url) {
    return Boolean(facebookVideoId(url))
  },
  async normalizeUrl(url) {
    const id = facebookVideoId(url)
    if (!id) throw new Error('UNSUPPORTED_URL')
    const parsed = parseHttpUrl(url)
    if (parsed && hostWithoutWww(parsed.hostname) === 'fb.watch') {
      return `https://fb.watch/${id}`
    }
    return `https://www.facebook.com/watch?v=${id}`
  },
  async getMetadata(url) {
    const id = facebookVideoId(url)
    if (!id) throw new Error('UNSUPPORTED_URL')
    const normalizedUrl = await facebookProvider.normalizeUrl(url)
    const metadata: VideoMetadata = {
      platform: 'facebook',
      platformVideoId: id,
      originalUrl: url.trim(),
      normalizedUrl,
      title: null,
      description: null,
      durationMs: null,
      width: null,
      height: null,
      aspectRatio: null,
      thumbnailUrl: null,
      publishedAt: null,
      source: {
        sourceProfileId: null,
        sourceUsername: null,
        sourceName: null,
        sourceUrl: null,
      },
    }
    return metadata
  },
}
