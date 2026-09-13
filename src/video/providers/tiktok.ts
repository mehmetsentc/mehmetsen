import type { VideoMetadata } from '@/video/domain/types'
import { hostWithoutWww, parseHttpUrl } from '@/video/metadata/normalizeUrl'
import type { VideoProvider } from './types'

const VIDEO_PATH = /\/@([^/]+)\/video\/(\d+)/i
const SHORT_ID = /^\/([A-Za-z0-9]+)\/?$/

function tiktokParts(url: string): { username: string | null; id: string } | null {
  const parsed = parseHttpUrl(url)
  if (!parsed) return null
  const host = hostWithoutWww(parsed.hostname)
  if (host !== 'tiktok.com' && host !== 'vm.tiktok.com' && host !== 'vt.tiktok.com') return null
  const video = parsed.pathname.match(VIDEO_PATH)
  if (video) return { username: video[1], id: video[2] }
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
    const short = parsed.pathname.match(SHORT_ID)
    if (short) return { username: null, id: short[1] }
  }
  return null
}

export const tiktokProvider: VideoProvider = {
  platform: 'tiktok',
  supports(url) {
    return Boolean(tiktokParts(url))
  },
  async normalizeUrl(url) {
    const parts = tiktokParts(url)
    if (!parts) throw new Error('UNSUPPORTED_URL')
    if (parts.username) {
      return `https://www.tiktok.com/@${parts.username}/video/${parts.id}`
    }
    return `https://www.tiktok.com/video/${parts.id}`
  },
  async getMetadata(url) {
    const parts = tiktokParts(url)
    if (!parts) throw new Error('UNSUPPORTED_URL')
    const normalizedUrl = parts.username
      ? `https://www.tiktok.com/@${parts.username}/video/${parts.id}`
      : `https://www.tiktok.com/video/${parts.id}`
    const metadata: VideoMetadata = {
      platform: 'tiktok',
      platformVideoId: parts.id,
      originalUrl: url.trim(),
      normalizedUrl,
      title: null,
      description: null,
      durationMs: null,
      width: null,
      height: null,
      aspectRatio: '9:16',
      thumbnailUrl: null,
      publishedAt: null,
      source: {
        sourceProfileId: null,
        sourceUsername: parts.username,
        sourceName: parts.username,
        sourceUrl: parts.username ? `https://www.tiktok.com/@${parts.username}` : null,
      },
    }
    return metadata
  },
}
