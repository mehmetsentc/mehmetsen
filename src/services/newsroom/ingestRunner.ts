/**
 * Unified newsroom ingest — checks all RSS sources (local + breaking) in one cycle.
 */
import { breakingNewsEditor } from '@/services/newsroom/breakingNewsEditor'
import { localNewsEditor } from '@/services/newsroom/localNewsEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'

export interface NewsroomIngestResult {
  startedAt: string
  durationMs: number
  local: NewsroomRunResult
  breaking: NewsroomRunResult
  totals: {
    sourcesChecked: number
    itemsFetched: number
    itemsNew: number
    itemsSkipped: number
    itemsFailed: number
    draftsCreated: number
    autoPublished: number
    lowConfidence: number
    errors: string[]
  }
}

function mergeTotals(local: NewsroomRunResult, breaking: NewsroomRunResult) {
  return {
    sourcesChecked: local.sourcesChecked + breaking.sourcesChecked,
    itemsFetched: local.itemsFetched + breaking.itemsFetched,
    itemsNew: local.itemsNew + breaking.itemsNew,
    itemsSkipped: local.itemsSkipped + breaking.itemsSkipped,
    itemsFailed: local.itemsFailed + breaking.itemsFailed,
    draftsCreated: local.draftsCreated + breaking.draftsCreated,
    autoPublished: local.autoPublished + breaking.autoPublished,
    lowConfidence: local.lowConfidence + breaking.lowConfidence,
    errors: [...local.errors, ...breaking.errors],
  }
}

/** Run local then breaking editors sequentially (all RSS sources, ~10 min cron). */
export async function runNewsroomIngest(): Promise<NewsroomIngestResult> {
  const started = Date.now()
  const startedAt = new Date().toISOString()

  const local = await localNewsEditor.run()
  const breaking = await breakingNewsEditor.run()

  return {
    startedAt,
    durationMs: Date.now() - started,
    local,
    breaking,
    totals: mergeTotals(local, breaking),
  }
}

export function emptyIngestResult(): NewsroomIngestResult {
  return {
    startedAt: new Date().toISOString(),
    durationMs: 0,
    local: emptyNewsroomResult('local-news'),
    breaking: emptyNewsroomResult('breaking-news'),
    totals: mergeTotals(
      emptyNewsroomResult('local-news'),
      emptyNewsroomResult('breaking-news')
    ),
  }
}
