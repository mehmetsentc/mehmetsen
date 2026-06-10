import { SPORTS_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Sports worker — Fanatik, Fotomaç, Sporx, Ajansspor, TRT Spor, NTV Spor,
 * Hürriyet Spor, BBC Sport, ESPN Soccer, Goal.com, F1 ESPN, Transfermarkt, UEFA.
 * Covers: football, basketball, F1, tennis, transfers, Champions League, TFF.
 * Cron: every 5 min.
 */
export async function runSportsWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'sports-news',
    editorType: 'national',
    sourceIds: SPORTS_NEWS_SOURCE_IDS,
    forcedCategoryId: 'spor',
    enrichInput: (_item, source) => ({
      extraTags: [
        'spor',
        source.id.includes('f1') || source.id.includes('espn') ? 'formula-1' : 'futbol',
        source.id.includes('transfer') ? 'transfer' : '',
      ].filter(Boolean),
    }),
  })
}
