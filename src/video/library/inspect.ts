import { dedupKeysFromMetadata } from '@/video/domain/dedup'
import type { VideoInspectResult } from '@/video/domain/types'
import { detectVideoProvider } from '@/video/providers/registry'
import type { VideoLibraryRepository } from './types'

export async function inspectVideoUrl(
  url: string,
  repository: VideoLibraryRepository
): Promise<VideoInspectResult> {
  const trimmed = url.trim()
  if (!trimmed) throw new Error('INVALID_URL')
  let provider
  try {
    provider = detectVideoProvider(trimmed)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'INVALID_URL'
    throw new Error(message === 'UNSUPPORTED_URL' ? 'INVALID_URL' : message)
  }
  const metadata = await provider.getMetadata(trimmed)
  metadata.normalizedUrl = await provider.normalizeUrl(trimmed)
  const existing = await repository.findByDedup(dedupKeysFromMetadata(metadata))
  return { metadata, existing }
}
