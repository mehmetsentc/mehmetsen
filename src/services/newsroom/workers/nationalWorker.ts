import { NATIONAL_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/** National worker — Turkish national outlets, 5 min cron. */
export async function runNationalWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'national-news',
    editorType: 'national',
    sourceIds: NATIONAL_NEWS_SOURCE_IDS,
  })
}
