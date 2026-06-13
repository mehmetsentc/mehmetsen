import { GASTRONOMI_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Gastronomi worker — Lezzet.com, Yemek.com, Milliyet Gastronomi,
 * Hürriyet Gastronomi, Google News yemek/restoran aramaları.
 * Covers: yemek tarifleri, restoran açılış/kapanış, şef haberleri,
 * Michelin yıldızı, gastronomi festivalleri.
 * Cron: every 30 min.
 */
export async function runGastronomyWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'gastronomi-news',
    editorType: 'national',
    sourceIds: [...GASTRONOMI_SOURCE_IDS],
    forcedCategoryId: 'gastronomi',
    enrichInput: (_item, _source) => ({
      extraTags: ['gastronomi', 'yemek', 'mutfak'],
    }),
  })
}
