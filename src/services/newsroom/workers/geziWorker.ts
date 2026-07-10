import { GEZI_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Gezi worker — Gezginler.net, Milliyet Seyahat, CNN Türk Seyahat,
 * Lonely Planet, Google News gezi aramaları.
 * Covers: destinasyon önerileri, gezi rotaları, seyahat rehberleri,
 * tatil fikirleri, keşif haberleri, konaklama tavsiyeleri.
 * Cron: every 60 min.
 */
export async function runGeziWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'gezi-news',
    editorType: 'national',
    sourceIds: [...GEZI_SOURCE_IDS],
    forcedCategoryId: 'gezi',
    enrichInput: (_item, _source) => ({
      extraTags: ['gezi', 'seyahat', 'destinasyon', 'tatil'],
    }),
  })
}
