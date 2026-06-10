import { WORLD_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/** World news worker — Reuters, AP, Al Jazeera, Guardian. 15 min cron. */
export async function runWorldWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'world-news',
    editorType: 'national',
    sourceIds: WORLD_NEWS_SOURCE_IDS,
    forcedCategoryId: 'dunya',
  })
}
