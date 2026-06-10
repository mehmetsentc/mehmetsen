import { HEALTH_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/** Health & Science worker — WHO, NIH, Nature, Science Daily. 1h cron. */
export async function runHealthWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'health-news',
    editorType: 'national',
    sourceIds: HEALTH_NEWS_SOURCE_IDS,
  })
}
