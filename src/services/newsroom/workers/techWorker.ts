import { TECH_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/** Technology worker — TechCrunch, Verge, Wired, Ars Technica, TR tech sites. 30 min cron. */
export async function runTechWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'tech-news',
    editorType: 'national',
    sourceIds: TECH_NEWS_SOURCE_IDS,
    forcedCategoryId: 'teknoloji',
  })
}
