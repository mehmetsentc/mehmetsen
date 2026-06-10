import { SPORTS_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/** Sports worker — Fanatik, Fotomaç, Sporx, Ajansspor, NTV Spor. 15 min cron. */
export async function runSportsWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'sports-news',
    editorType: 'national',
    sourceIds: SPORTS_NEWS_SOURCE_IDS,
    forcedCategoryId: 'spor',
  })
}
