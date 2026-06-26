import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runTechWorker } from '@/services/newsroom/workers/techWorker'
import { runHackerNewsWorker } from '@/services/newsroom/workers/hackerNewsWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function runTechAndHN(): Promise<NewsroomRunResult> {
  const [rssResult, hnResult] = await Promise.allSettled([
    runTechWorker(),
    runHackerNewsWorker(),
  ])

  const merged = emptyNewsroomResult('tech-news')

  for (const r of [rssResult, hnResult]) {
    if (r.status === 'fulfilled') {
      const v = r.value
      merged.sourcesChecked += v.sourcesChecked
      merged.itemsFetched += v.itemsFetched
      merged.itemsNew += v.itemsNew
      merged.itemsSkipped += v.itemsSkipped
      merged.itemsFailed += v.itemsFailed
      merged.draftsCreated += v.draftsCreated
      merged.autoPublished += v.autoPublished
      merged.lowConfidence += v.lowConfidence
      merged.errors.push(...v.errors)
      merged.durationMs = Math.max(merged.durationMs, v.durationMs)
    } else {
      merged.errors.push(`worker failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
    }
  }

  return merged
}

const handler = createNewsroomCronHandler('technology', runTechAndHN)

export const GET = handler.GET
export const POST = handler.POST
