import type { VideoMetadata } from '@/video/domain/types'
import { hostWithoutWww, parseHttpUrl } from '@/video/metadata/normalizeUrl'
import type { VideoProvider } from './types'

const REEL_OR_POST = /\/(reel|p|reels)\/([A-Za-z0-9_-]+)/i

function instagramId(url: string): { kind: 'reel' | 'p'; id: string } | null {
  const parsed = parseHttpUrl(url)
  if (!parsed) return null
  const host = hostWithoutWww(parsed.hostname)
  if (host !== 'instagram.com' && host !== 'instagr.am') return null
  const match = parsed.pathname.match(REEL_OR_POST)
  if (!match) return null
  const kind = match[1].toLowerCase() === 'p' ? 'p' : 'reel'
  return { kind, id: match[2] }
}

function metadataStub(
  originalUrl: string,
  normalizedUrl: string,
  platformVideoId: string
): VideoMetadata {
  return {
    platform: 'instagram',
    platformVideoId,
    originalUrl: originalUrl.trim(),
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
}

export const instagramProvider: VideoProvider = {
  platform: 'instagram',
  supports(url) {
    return Boolean(instagramId(url))
  },
  async normalizeUrl(url) {
    const parsed = instagramId(url)
    if (!parsed) throw new Error('UNSUPPORTED_URL')
    return `https://www.instagram.com/${parsed.kind}/${parsed.id}/`
  },
  async getMetadata(url) {
    const parsed = instagramId(url)
    if (!parsed) throw new Error('UNSUPPORTED_URL')
    const normalizedUrl = `https://www.instagram.com/${parsed.kind}/${parsed.id}/`
    return metadataStub(url, normalizedUrl, parsed.id)
  },
}
