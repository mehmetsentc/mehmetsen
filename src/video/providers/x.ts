import type { VideoMetadata } from '@/video/domain/types'
import { hostWithoutWww, parseHttpUrl } from '@/video/metadata/normalizeUrl'
import type { VideoProvider } from './types'

const STATUS = /\/status\/(\d+)/i

function xStatusId(url: string): string | null {
  const parsed = parseHttpUrl(url)
  if (!parsed) return null
  const host = hostWithoutWww(parsed.hostname)
  if (host !== 'x.com' && host !== 'twitter.com' && host !== 'mobile.twitter.com') return null
  const match = parsed.pathname.match(STATUS)
  return match?.[1] ?? null
}

export const xProvider: VideoProvider = {
  platform: 'x',
  supports(url) {
    return Boolean(xStatusId(url))
  },
  async normalizeUrl(url) {
    const id = xStatusId(url)
    if (!id) throw new Error('UNSUPPORTED_URL')
    return `https://x.com/i/status/${id}`
  },
  async getMetadata(url) {
    const id = xStatusId(url)
    if (!id) throw new Error('UNSUPPORTED_URL')
    const parsed = parseHttpUrl(url)
    const user = parsed?.pathname.match(/^\/([^/]+)\//)?.[1]
    const username = user && user !== 'i' ? user : null
    const metadata: VideoMetadata = {
      platform: 'x',
      platformVideoId: id,
      originalUrl: url.trim(),
      normalizedUrl: `https://x.com/i/status/${id}`,
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
        sourceUsername: username,
        sourceName: username,
        sourceUrl: username ? `https://x.com/${username}` : null,
      },
    }
    return metadata
  },
}
