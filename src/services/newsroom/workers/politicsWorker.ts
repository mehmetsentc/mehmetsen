import { POLITICS_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Politics worker — ANKA, AA Siyaset, NTV Politika, Habertürk Siyaset,
 * Cumhuriyet, T24, BBC Türkçe, Euronews TR.
 * Covers: government, parliament, parties, elections, foreign policy.
 * Cron: every 5 min.
 */
export async function runPoliticsWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'politics-news',
    editorType: 'national',
    sourceIds: POLITICS_NEWS_SOURCE_IDS,
    forcedCategoryId: 'siyaset',
    enrichInput: () => ({
      extraTags: ['siyaset', 'politika', 'meclis', 'hükümet'],
    }),
  })
}
