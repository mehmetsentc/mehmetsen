import { enqueueDownloadJob } from '@/video/importer/enqueue'
import { resolveImportSource } from '@/video/importer/resolveSource'
import type { VideoImportStore } from '@/video/importer/types'
import { parseBulkVideoUrls } from './parseBulkUrls'
import { registerVideoUrl } from './register'
import type { VideoLibraryRepository } from './types'

export type EnqueueSelectedRow = {
  url: string
  outcome: 'QUEUED' | 'ALREADY_QUEUED' | 'ALREADY_IMPORTED' | 'SKIPPED'
  reason: string | null
  itemId: string | null
  jobId: string | null
}

export type EnqueueSelectedResult = {
  selected: number
  queued: number
  skipped: number
  rows: EnqueueSelectedRow[]
}

export async function enqueueSelectedVideoUrls(
  urls: string[],
  createdBy: string,
  repository: VideoLibraryRepository,
  store: VideoImportStore
): Promise<EnqueueSelectedResult> {
  const parsed = parseBulkVideoUrls(urls.join('\n'))
  if (parsed.unique.length === 0) {
    throw new Error('ZERO_SELECTION')
  }

  const rows: EnqueueSelectedRow[] = []
  let queued = 0
  let skipped = 0

  for (const url of parsed.unique) {
    try {
      const registered = await registerVideoUrl(url, createdBy, repository)
      const source = resolveImportSource(registered.item)
      if (!source.ok) {
        skipped += 1
        rows.push({
          url,
          outcome: 'SKIPPED',
          reason: source.code,
          itemId: registered.item.id,
          jobId: null,
        })
        continue
      }
      const result = await enqueueDownloadJob(registered.item.id, store)
      if (result.outcome === 'QUEUED') queued += 1
      rows.push({
        url,
        outcome: result.outcome,
        reason: result.outcome === 'QUEUED' ? null : result.outcome,
        itemId: result.item.id,
        jobId: 'job' in result ? result.job.id : null,
      })
    } catch (err) {
      skipped += 1
      rows.push({
        url,
        outcome: 'SKIPPED',
        reason: err instanceof Error ? err.message : 'ENQUEUE_FAILED',
        itemId: null,
        jobId: null,
      })
    }
  }

  return {
    selected: parsed.unique.length,
    queued,
    skipped,
    rows,
  }
}
