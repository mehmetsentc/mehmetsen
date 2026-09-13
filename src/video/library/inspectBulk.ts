import type { VideoLibraryItem, VideoMetadata, VideoPlatform } from '@/video/domain/types'
import { resolveImportSource } from '@/video/importer/resolveSource'
import { inspectVideoUrl } from './inspect'
import { parseBulkVideoUrls } from './parseBulkUrls'
import type { VideoLibraryRepository } from './types'

export type BulkInspectRow = {
  originalUrl: string
  normalizedUrl: string | null
  platform: VideoPlatform | null
  title: string | null
  thumbnailUrl: string | null
  sourceName: string | null
  sourceUsername: string | null
  sourceUrl: string | null
  durationMs: number | null
  rightsStatus: 'UNKNOWN'
  duplicate: boolean
  existingId: string | null
  downloadable: boolean
  downloadCode: string | null
  downloadMessage: string | null
  error: string | null
  metadata: VideoMetadata | null
  existing: VideoLibraryItem | null
}

export type BulkInspectResult = {
  rows: BulkInspectRow[]
  uniqueCount: number
  blankSkipped: number
  duplicateLines: number
}

/**
 * Inspect many URLs. Never downloads, never inserts, never enqueues.
 */
export async function inspectBulkVideoUrls(
  raw: string,
  repository: VideoLibraryRepository
): Promise<BulkInspectResult> {
  const parsed = parseBulkVideoUrls(raw)
  const seenNormalized = new Map<string, string>()
  const rows: BulkInspectRow[] = []

  for (const originalUrl of parsed.unique) {
    try {
      const inspected = await inspectVideoUrl(originalUrl, repository)
      const source = resolveImportSource({
        platform: inspected.metadata.platform,
        originalUrl: inspected.metadata.originalUrl,
        normalizedUrl: inspected.metadata.normalizedUrl,
      })
      const normalized = inspected.metadata.normalizedUrl
      const prior = seenNormalized.get(normalized)
      const duplicate = Boolean(inspected.existing) || Boolean(prior)
      seenNormalized.set(normalized, originalUrl)
      rows.push({
        originalUrl,
        normalizedUrl: normalized,
        platform: inspected.metadata.platform,
        title: inspected.metadata.title,
        thumbnailUrl: inspected.metadata.thumbnailUrl,
        sourceName: inspected.metadata.source.sourceName,
        sourceUsername: inspected.metadata.source.sourceUsername,
        sourceUrl: inspected.metadata.source.sourceUrl,
        durationMs: inspected.metadata.durationMs,
        rightsStatus: 'UNKNOWN',
        duplicate,
        existingId: inspected.existing?.id ?? null,
        downloadable: source.ok,
        downloadCode: source.ok ? null : source.code,
        downloadMessage: source.ok ? null : source.message,
        error: null,
        metadata: inspected.metadata,
        existing: inspected.existing,
      })
    } catch (err) {
      const code = err instanceof Error ? err.message : 'INSPECT_FAILED'
      rows.push({
        originalUrl,
        normalizedUrl: null,
        platform: null,
        title: null,
        thumbnailUrl: null,
        sourceName: null,
        sourceUsername: null,
        sourceUrl: null,
        durationMs: null,
        rightsStatus: 'UNKNOWN',
        duplicate: false,
        existingId: null,
        downloadable: false,
        downloadCode: code,
        downloadMessage: null,
        error: code,
        metadata: null,
        existing: null,
      })
    }
  }

  return {
    rows,
    uniqueCount: parsed.unique.length,
    blankSkipped: parsed.blankSkipped,
    duplicateLines: parsed.duplicates.length,
  }
}
