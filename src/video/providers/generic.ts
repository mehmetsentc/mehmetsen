import { createHash } from 'node:crypto'
import type { VideoMetadata } from '@/video/domain/types'
import { hostWithoutWww, parseHttpUrl, stripTrackingParams } from '@/video/metadata/normalizeUrl'
import type { VideoProvider } from './types'

function genericNormalized(url: string): string {
  const parsed = parseHttpUrl(url)
  if (!parsed) throw new Error('INVALID_URL')
  stripTrackingParams(parsed)
  parsed.hostname = hostWithoutWww(parsed.hostname)
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/'
  parsed.searchParams.sort()
  return parsed.href
}

export const genericProvider: VideoProvider = {
  platform: 'generic',
  supports(url) {
    return Boolean(parseHttpUrl(url))
  },
  async normalizeUrl(url) {
    return genericNormalized(url)
  },
  async getMetadata(url) {
    const normalizedUrl = genericNormalized(url)
    const platformVideoId = createHash('sha256').update(normalizedUrl).digest('hex').slice(0, 32)
    const metadata: VideoMetadata = {
      platform: 'generic',
      platformVideoId,
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
