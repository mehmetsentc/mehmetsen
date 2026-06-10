import { HEALTH_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Health & Science worker — WHO, CDC, NIH, The Lancet, Nature, Science Daily,
 * Medimagazin, Sağlık Aktüel.
 * Covers: medicine, public health, nutrition, disease alerts, research.
 * Cron: every 15 min.
 */
export async function runHealthWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'health-news',
    editorType: 'national',
    sourceIds: HEALTH_NEWS_SOURCE_IDS,
    forcedCategoryId: 'saglik',
    enrichInput: () => ({
      extraTags: ['sağlık', 'tıp', 'bilim', 'araştırma'],
    }),
  })
}
