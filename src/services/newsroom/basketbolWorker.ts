/**
 * Basketbol Worker
 * Kaynak: Sözcü — sadece basketbol kategorisine kaydeder.
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export async function runBasketbolWorker(): Promise<NewsroomRunResult> {
  return runRssEditor({
    sourceIds: ['sozcu-basketbol'],
    editorId: 'basketbol',
    editorType: 'national',
    maxAiCalls: 8,
    forcedCategoryId: 'basketbol',
    enrichInput: () => ({
      extraTags: ['basketbol', 'bsl', 'euroleague', 'nba', 'spor'],
    }),
  })
}
