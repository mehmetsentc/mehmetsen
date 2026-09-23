import { registerVideoUrl } from '@/video/library/register'
import { parseBulkVideoUrls } from '@/video/library/parseBulkUrls'
import type { VideoLibraryRepository } from '@/video/library/types'
import { enqueueDownloadJob } from '@/video/importer/enqueue'
import { resolveImportSource } from '@/video/importer/resolveSource'
import { processOneImportJob } from '@/video/importer/worker'
import type { VideoImportStore } from '@/video/importer/types'
import type { StorageProvider } from '@/lib/storage/types'
import type { VideoLibraryItem } from '@/video/domain/types'

const SKIP_CODES = new Set([
  'PLATFORM_METADATA_ONLY',
  'YOUTUBE_NOT_DIRECT_MEDIA',
  'NOT_DIRECT_MEDIA',
  'UNSUPPORTED_URL',
  'INVALID_URL',
])

export function pickDirectImportUrls(
  rows: Array<{ originalUrl: string; downloadable: boolean; error: string | null }>,
  selected: Record<string, boolean>
): string[] {
  return rows
    .filter((row) => selected[row.originalUrl] && row.downloadable && !row.error)
    .map((row) => row.originalUrl)
}

export async function importDirectNow(input: {
  url: string
  createdBy: string
  repository: VideoLibraryRepository
  store: VideoImportStore
  storage: Pick<StorageProvider, 'upload' | 'exists'>
}): Promise<{
  outcome: 'SUCCEEDED' | 'ALREADY_IMPORTED' | 'FAILED' | 'REQUEUED' | 'IDLE'
  item: VideoLibraryItem | null
  jobId: string | null
  code?: string
}> {
  const registered = await registerVideoUrl(input.url, input.createdBy, input.repository)
  const source = resolveImportSource(registered.item)
  if (!source.ok) {
    throw new Error(source.code)
  }

  const queued = await enqueueDownloadJob(registered.item.id, input.store)
  if (queued.outcome === 'ALREADY_IMPORTED') {
    const owned = await input.store.updateItem(queued.item.id, {
      rightsStatus: 'OWNED',
      updatedAt: new Date(),
    })
    return { outcome: 'ALREADY_IMPORTED', item: owned, jobId: null }
  }

  const tick = await processOneImportJob({
    store: input.store,
    storage: input.storage,
    workerId: 'vl-owned-direct',
  })

  if (tick.outcome === 'IDLE') {
    return { outcome: 'IDLE', item: registered.item, jobId: 'job' in queued ? queued.job.id : null }
  }

  const item = await input.store.findItemById(tick.itemId)
  if (tick.outcome === 'SUCCEEDED' && item) {
    const owned = await input.store.updateItem(item.id, {
      rightsStatus: 'OWNED',
      updatedAt: new Date(),
    })
    return { outcome: 'SUCCEEDED', item: owned, jobId: tick.jobId }
  }

  return {
    outcome: tick.outcome,
    item,
    jobId: tick.jobId,
    code: 'code' in tick ? tick.code : undefined,
  }
}

export type ImportDirectNowManyRow = {
  url: string
  outcome: 'SUCCEEDED' | 'ALREADY_IMPORTED' | 'FAILED' | 'REQUEUED' | 'IDLE' | 'SKIPPED'
  code: string | null
  itemId: string | null
}

export async function importDirectNowMany(input: {
  urls: string[]
  createdBy: string
  repository: VideoLibraryRepository
  store: VideoImportStore
  storage: Pick<StorageProvider, 'upload' | 'exists'>
}): Promise<{
  selected: number
  imported: number
  skipped: number
  failed: number
  rows: ImportDirectNowManyRow[]
}> {
  const parsed = parseBulkVideoUrls(input.urls.join('\n'))
  if (parsed.unique.length === 0) throw new Error('ZERO_SELECTION')

  const rows: ImportDirectNowManyRow[] = []
  let imported = 0
  let skipped = 0
  let failed = 0

  for (const url of parsed.unique) {
    try {
      const result = await importDirectNow({
        url,
        createdBy: input.createdBy,
        repository: input.repository,
        store: input.store,
        storage: input.storage,
      })
      if (result.outcome === 'SUCCEEDED' || result.outcome === 'ALREADY_IMPORTED') imported += 1
      else failed += 1
      rows.push({
        url,
        outcome: result.outcome,
        code: result.code ?? null,
        itemId: result.item?.id ?? null,
      })
    } catch (err) {
      const code = err instanceof Error ? err.message : 'IMPORT_FAILED'
      if (SKIP_CODES.has(code)) skipped += 1
      else failed += 1
      rows.push({
        url,
        outcome: 'SKIPPED',
        code,
        itemId: null,
      })
    }
  }

  return { selected: parsed.unique.length, imported, skipped, failed, rows }
}
